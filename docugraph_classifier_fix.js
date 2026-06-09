/**
 * DOCUGRAPH CLASSIFIER FIX (Consolidated Master)
 * 
 * All versions consolidated into single file
 * Latest logic from v6 with refinements from v4 & v5
 * 
 * Fixes:
 * - GCash Receipt vs Flowchart misclassification (multi-separator variance detection)
 * - Receipt layout detection (horizontal dividers, single-column stacking)
 * - Flowchart detection (squarish boxes, vertical spacing, no separators)
 * - Region type reclassification (separators, figures, shapes)
 * 
 * Intercept points:
 * 1. GNN.analyzeLayout() - fix region types early
 * 2. currentLayoutData - intercept pre-OCR document type
 * 3. DocumentTypeClassifier - patch text-phase classification
 * 4. lastProcessedDocument - final safety catch
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // RECEIPT TEXT PATTERN DETECTION
  // ═══════════════════════════════════════════════════════════════════
  const RECEIPT_PATTERNS = [
    /gcash/i, /express\s*send/i, /sent\s*via/i, /ref\s*no/i,
    /transaction\s*(id|no|#|ref)/i, /amount\s*sent/i,
    /total\s*amount\s*sent/i, /carbon\s*footprint/i,
    /by\s*going\s*digital/i, /gco2e/i, /\d{13,16}/,
    /\+63\s*9\d{2}/, /₱\s*[\d,]+/,
    /paymaya|maya|grabpay|shopeepay|coins\.ph/i,
    /payment\s*(received|sent|complete|successful)/i,
    /e-wallet|mobile\s*money/i, /remittance|remit/i,
  ];

  function receiptScore(text) {
    if (!text) return 0;
    return RECEIPT_PATTERNS.filter(p => p.test(text)).length;
  }

  // ═══════════════════════════════════════════════════════════════════
  // UTILITY: Fix region types based on geometry
  // Separates decorative elements from actual diagram shapes
  // ═══════════════════════════════════════════════════════════════════
  function fixRegionTypes(regions) {
    if (!regions || !regions.length) return regions;
    return regions.map(r => {
      if (!r.bbox || r.bbox.length < 4) return r;
      const w = r.bbox[2] - r.bbox[0];
      const h = r.bbox[3] - r.bbox[1];
      if (w <= 0 || h <= 0) return r;
      const ar = w / h;
      const area = w * h;

      // Wide thin regions → separator (horizontal/vertical dividers)
      if (r.type === 'shape' && ar > 4 && h < 4 && w > 20)
        return { ...r, type: 'separator' };
      if (r.type === 'shape' && h < 2 && w > 10)
        return { ...r, type: 'separator' };
      
      // Tiny shapes → figure (icon/logo, not diagram elements)
      if (r.type === 'shape' && area < 200)
        return { ...r, type: 'figure' };

      return r;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // GCash Receipt Detector - Ultra-Specific
  // Detects GCash's unique visual characteristics:
  //   - Multiple separators at DIFFERENT widths (40%, 60%, 70%)
  //   - This pattern is UNIQUE to GCash
  //   - Flowcharts NEVER have separators at varying widths
  // ═══════════════════════════════════════════════════════════════════
  function detectGCashReceipt(regions) {
    if (!regions || regions.length < 5) return false;

    const separators = regions.filter(r => r.type === 'separator');
    if (separators.length < 2) return false;

    // Calculate widths of all separators
    const separatorWidths = separators
      .filter(r => r.bbox && r.bbox.length >= 4)
      .map(r => r.bbox[2] - r.bbox[0]);

    if (separatorWidths.length < 2) return false;

    // Check for variance in separator widths
    const avgWidth = separatorWidths.reduce((a, b) => a + b, 0) / separatorWidths.length;
    const variance = separatorWidths.reduce((acc, w) => acc + Math.pow(w - avgWidth, 2), 0) / separatorWidths.length;
    const stdDev = Math.sqrt(variance);

    // GCash signature: high variance in separator widths (stdDev > 5)
    if (stdDev > 5 && separatorWidths.length >= 2) {
      console.log('[classifier-fix] GCash Receipt detected (separators variance: stdDev=' + stdDev.toFixed(1) + ')');
      return true;
    }

    // Fallback: check for GCash text patterns
    const fullText = regions.map(r => r.text || '').join(' ').toLowerCase();
    const gcashKeywords = [/gcash/, /express\s*send/, /sent\s*via\s*gcash/, /carbon\s*footprint/, /going\s*digital/];
    const matches = gcashKeywords.filter(p => p.test(fullText)).length;
    if (matches >= 2) {
      console.log('[classifier-fix] GCash Receipt (text patterns: ' + matches + ' keywords)');
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Receipt Layout Detector
  // Detects receipt geometry (separators, single-column, tables)
  // ═══════════════════════════════════════════════════════════════════
  function detectReceiptLayout(regions) {
    if (!regions || regions.length < 2) return false;

    const types = regions.map(r => r.type || '');
    const separators = regions.filter(r => r.type === 'separator');
    const separatorCount = separators.length;
    const tableCount = types.filter(t => t === 'table').length;
    const shapeCount = types.filter(t => t === 'shape').length;
    const textCount = types.filter(t => t === 'para' || t === 'text').length;
    const figureCount = types.filter(t => t === 'figure').length;

    // Calculate horizontal spread (single-column detection)
    const xPositions = regions
      .filter(r => r.bbox && r.bbox.length >= 4)
      .map(r => (r.bbox[0] + r.bbox[2]) / 2);
    
    if (xPositions.length === 0) return false;

    const xMin = Math.min(...xPositions);
    const xMax = Math.max(...xPositions);
    const xRange = xMax - xMin;
    const isSingleColumn = xRange < 20;

    // Get page width estimate
    let pageWidth = 100;
    try {
      const allX2 = regions.filter(r => r.bbox && r.bbox.length >= 4).map(r => r.bbox[2]);
      if (allX2.length > 0) pageWidth = Math.max(...allX2);
    } catch (e) {
      pageWidth = 100;
    }

    // SIGNAL 0: Wide separator (~50-70% of page width) - GCash signature
    for (let sep of separators) {
      if (sep.bbox && sep.bbox.length >= 4) {
        const sepWidth = sep.bbox[2] - sep.bbox[0];
        const widthPercent = (sepWidth / pageWidth) * 100;
        if (widthPercent >= 50 && widthPercent <= 70) {
          console.log('[classifier-fix] Receipt detected (wide separator: ' + widthPercent.toFixed(1) + '% width)');
          return true;
        }
      }
    }

    // SIGNAL 1: Separator + single-column layout
    if (separatorCount >= 1 && isSingleColumn) {
      console.log('[classifier-fix] Receipt detected (separator + single-column)');
      return true;
    }

    // SIGNAL 2: Table + single-column layout
    if (tableCount >= 1 && isSingleColumn) {
      console.log('[classifier-fix] Receipt detected (table + single-column)');
      return true;
    }

    // SIGNAL 3: Many paragraphs in single column
    if (isSingleColumn && textCount >= 4 && shapeCount <= 3) {
      console.log('[classifier-fix] Receipt detected (stacked text layout)');
      return true;
    }

    // SIGNAL 4: Mixed regions (text + sep/table) in single column
    const hasMixedStructure = (separatorCount >= 1 || tableCount >= 1) && 
                              (textCount >= 2 || figureCount >= 1) &&
                              isSingleColumn;
    if (hasMixedStructure) {
      console.log('[classifier-fix] Receipt detected (mixed structure)');
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Flowchart Layout Detector
  // Detects flowchart from region layout (boxes + spacing, no separators)
  // ═══════════════════════════════════════════════════════════════════
  function detectFlowchartLayout(regions) {
    if (!regions || regions.length < 3) return false;

    const types = regions.map(r => r.type || '');
    const separatorCount = types.filter(t => t === 'separator').length;
    const tableCount = types.filter(t => t === 'table').length;

    // HARD REJECT: Receipt indicators present
    if (separatorCount >= 1 || tableCount >= 1) {
      return false;
    }

    // Count squarish regions (potential flowchart boxes)
    const candidateBoxes = regions.filter(r => {
      if (!r.bbox || r.bbox.length < 4) return false;
      const w = r.bbox[2] - r.bbox[0];
      const h = r.bbox[3] - r.bbox[1];
      if (w <= 0 || h <= 0) return false;
      const ar = w / h;
      const area = w * h;
      // Squarish boxes, reasonable size
      return ar >= 0.25 && ar <= 4.0 && area >= 50 && area <= 3000;
    });

    if (candidateBoxes.length < 3) return false;

    // Check vertical distribution (boxes not all on same row)
    const yPositions = candidateBoxes.map(r => (r.bbox[1] + r.bbox[3]) / 2).sort((a, b) => a - b);
    const yRange = yPositions[yPositions.length - 1] - yPositions[0];
    if (yRange < 20) return false;

    // Check horizontal spread (branching/decision structure)
    const xPositions = candidateBoxes.map(r => (r.bbox[0] + r.bbox[2]) / 2);
    const xMin = Math.min(...xPositions);
    const xMax = Math.max(...xPositions);
    const xRange = xMax - xMin;

    // Single-column = likely receipt, not flowchart
    if (xRange < 20) return false;

    // Check consistent spacing (flowchart signature)
    if (yPositions.length >= 2) {
      const gaps = [];
      for (let i = 1; i < yPositions.length; i++) {
        gaps.push(yPositions[i] - yPositions[i - 1]);
      }
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avgGap >= 3 && avgGap <= 40) {
        console.log('[classifier-fix] Flowchart detected (boxes=' + candidateBoxes.length + ', xRange=' + xRange.toFixed(1) + ')');
        return true;
      }
    }

    // Fallback: many boxes with good spread
    if (candidateBoxes.length >= 4 && yRange >= 30 && xRange >= 20) {
      console.log('[classifier-fix] Flowchart detected (geometry match)');
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // FIX 1: Patch currentLayoutData interceptor
  // ═══════════════════════════════════════════════════════════════════
  (function patchCurrentLayoutData() {
    const existing = Object.getOwnPropertyDescriptor(window, 'currentLayoutData');
    let _store = null;

    function reclassify(data) {
      if (!data || !data.structure) return data;

      if (data.regions) {
        data.regions = fixRegionTypes(data.regions);
      }

      const regions = data.regions || [];
      const isGCashReceipt = detectGCashReceipt(regions);
      const hasReceiptGeo = detectReceiptLayout(regions);
      const hasFlowchartGeo = detectFlowchartLayout(regions);
      const textScore = receiptScore(data.text || data.fullText || '');

      // GCash detected → force Receipt
      if (isGCashReceipt) {
        data.structure = {
          ...data.structure,
          documentType: 'Receipt',
          confidence: 0.95
        };
        if (data.metadata) data.metadata.detectedFlowchart = false;
        if (data.isFlowchart !== undefined) data.isFlowchart = false;
        return data;
      }

      // Receipt geometry detected → force Receipt
      if (hasReceiptGeo && textScore >= 2) {
        data.structure = {
          ...data.structure,
          documentType: 'Receipt',
          confidence: 0.90
        };
        if (data.metadata) data.metadata.detectedFlowchart = false;
        if (data.isFlowchart !== undefined) data.isFlowchart = false;
        return data;
      }

      // Flowchart geometry + no receipt signals → promote to Flowchart
      if (data.structure.documentType === 'Document' && hasFlowchartGeo && !hasReceiptGeo && textScore === 0) {
        data.structure = {
          ...data.structure,
          documentType: 'Flowchart',
          confidence: 0.75
        };
        return data;
      }

      return data;
    }

    try {
      if (existing && existing.set) {
        const prevGet = existing.get;
        const prevSet = existing.set;
        Object.defineProperty(window, 'currentLayoutData', {
          configurable: true,
          get() { return prevGet ? prevGet() : _store; },
          set(val) {
            if (prevSet) prevSet(val);
            _store = reclassify(val);
          }
        });
      } else {
        Object.defineProperty(window, 'currentLayoutData', {
          configurable: true,
          get() { return _store; },
          set(val) { _store = reclassify(val); }
        });
      }
      console.log('✅ currentLayoutData interceptor active');
    } catch (e) {
      console.warn('Could not patch currentLayoutData:', e.message);
    }
  })();

  // ═══════════════════════════════════════════════════════════════════
  // FIX 2: Patch DocumentTypeClassifier
  // ═══════════════════════════════════════════════════════════════════
  let _classAttempts = 0;
  function patchDocumentTypeClassifier() {
    if (typeof DocumentTypeClassifier === 'undefined') {
      if (++_classAttempts < 80) setTimeout(patchDocumentTypeClassifier, 200);
      return;
    }

    const _origClassify = DocumentTypeClassifier.prototype.classifyDocument;
    DocumentTypeClassifier.prototype.classifyDocument = function (doc) {
      const text = doc.text || '';
      const textScore = receiptScore(text);
      const regions = doc.regions || [];
      const isGCash = detectGCashReceipt(regions);
      const hasReceiptGeo = detectReceiptLayout(regions);
      const hasFlowchartGeo = detectFlowchartLayout(regions);

      // ULTRA-STRONG: GCash detected
      if (isGCash) {
        const result = _origClassify.call(this, doc);
        result.type = 'Receipt';
        result.confidence = 0.95;
        if (result.scores) result.scores.flowchart = 0;
        console.log('[classifier-fix] GCash Receipt detected (ULTRA-STRONG)');
        return result;
      }

      // HARD WIN: Receipt text patterns
      if (textScore >= 3) {
        const result = _origClassify.call(this, doc);
        result.type = 'Receipt';
        result.confidence = Math.min(0.97, 0.80 + textScore * 0.025);
        if (result.scores) result.scores.flowchart = 0;
        console.log('[classifier-fix] Receipt (text score=' + textScore + ')');
        return result;
      }

      // HARD REJECT: Receipt geometry detected
      if (hasReceiptGeo) {
        const result = _origClassify.call(this, doc);
        result.type = 'Receipt';
        result.confidence = 0.85;
        if (result.scores) result.scores.flowchart = 0;
        console.log('[classifier-fix] Receipt (geometry detected)');
        return result;
      }

      // RESTORE: Flowchart geometry when no receipt signals
      if (hasFlowchartGeo && !hasReceiptGeo && textScore === 0) {
        const result = _origClassify.call(this, doc);
        result.type = 'Flowchart';
        result.confidence = 0.82;
        console.log('[classifier-fix] Flowchart (geometry detected)');
        return result;
      }

      // SOFT SIGNAL: receipt text 1-2 patterns
      if (textScore >= 2 && textScore < 3) {
        const result = _origClassify.call(this, doc);
        if (result.type === 'Flowchart') {
          result.type = 'Receipt';
          if (result.scores) result.scores.flowchart = 0;
          console.log('[classifier-fix] Receipt (soft text signal)');
        }
        return result;
      }

      // DEFAULT: run original classifier
      return _origClassify.call(this, doc);
    };

    console.log('✅ DocumentTypeClassifier patched');
  }
  patchDocumentTypeClassifier();

  // ═══════════════════════════════════════════════════════════════════
  // FIX 3: Patch GNN.analyzeLayout
  // ═══════════════════════════════════════════════════════════════════
  let _gnnAttempts = 0;
  function patchGNNAnalyzeLayout() {
    if (typeof GNNDocumentAnalyzer === 'undefined') {
      if (++_gnnAttempts < 80) setTimeout(patchGNNAnalyzeLayout, 200);
      return;
    }

    const _origAnalyze = GNNDocumentAnalyzer.prototype.analyzeLayout;
    GNNDocumentAnalyzer.prototype.analyzeLayout = function (imageData, width, height) {
      const result = _origAnalyze.call(this, imageData, width, height);

      if (result && result.regions) {
        result.regions = fixRegionTypes(result.regions);
        
        const types = result.regions.map(r => r.type || '');
        const seps = types.filter(t => t === 'separator').length;
        const shapes = types.filter(t => t === 'shape').length;

        // Unblock flowchart only if we have separators (receipt indicator)
        if (result.structure && result.structure.documentType === 'Flowchart') {
          if (seps >= 2 && shapes < 2) {
            result.structure.documentType = 'Document';
          }
        }
      }

      return result;
    };

    console.log('✅ GNN.analyzeLayout patched');
  }
  patchGNNAnalyzeLayout();

  // ═══════════════════════════════════════════════════════════════════
  // FIX 4: Patch lastProcessedDocument (final safety catch)
  // ═══════════════════════════════════════════════════════════════════
  (function patchLastProcessedDocument() {
    let _store = window.lastProcessedDocument || null;

    function fixDoc(val) {
      if (!val) return null;
      
      const text = (val.ocr?.text || val.text || '');
      const textScore = receiptScore(text);
      const regions = val.layout?.regions || val.ocr?.regionResults || [];
      const isGCash = detectGCashReceipt(regions);
      const hasReceiptGeo = detectReceiptLayout(regions);
      const hasFlowchartGeo = detectFlowchartLayout(regions);

      // GCash detected
      if (isGCash) {
        return {
          ...val,
          structure: { ...val.structure, documentType: 'Receipt', confidence: 0.95 }
        };
      }

      // Receipt text patterns found + currently Flowchart
      if (textScore >= 3 && val.structure?.documentType === 'Flowchart') {
        return {
          ...val,
          structure: { ...val.structure, documentType: 'Receipt', confidence: 0.93 }
        };
      }

      // Receipt geometry found + currently Flowchart
      if (hasReceiptGeo && val.structure?.documentType === 'Flowchart') {
        return {
          ...val,
          structure: { ...val.structure, documentType: 'Receipt', confidence: 0.88 }
        };
      }

      // Flowchart geometry + no receipt signals → promote from Document
      if (hasFlowchartGeo && !hasReceiptGeo && textScore === 0 && val.structure?.documentType === 'Document') {
        return {
          ...val,
          structure: { ...val.structure, documentType: 'Flowchart', confidence: 0.82 }
        };
      }

      return val;
    }

    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'lastProcessedDocument');
      if (desc && desc.set) {
        const prevSet = desc.set;
        const prevGet = desc.get;
        Object.defineProperty(window, 'lastProcessedDocument', {
          configurable: true,
          get() { return prevGet ? prevGet() : _store; },
          set(val) {
            val = fixDoc(val);
            if (prevSet) prevSet(val);
            _store = val;
          }
        });
      } else {
        Object.defineProperty(window, 'lastProcessedDocument', {
          configurable: true,
          get() { return _store; },
          set(val) { _store = fixDoc(val); }
        });
      }
      console.log('✅ lastProcessedDocument interceptor active');
    } catch (e) {
      console.warn('Could not patch lastProcessedDocument:', e.message);
    }
  })();

  console.log(
    '%c✅ DOCUGRAPH Classifier Fix Applied',
    'color:#16a34a;font-weight:bold;font-size:12px',
    '— GCash receipt detection, Receipt geometry, Flowchart restoration'
  );

})();
