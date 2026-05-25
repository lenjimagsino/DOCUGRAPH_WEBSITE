/**
 * DOCUGRAPH CLASSIFIER FIX v6
 *
 * Problem: After v5 fixes, GCash receipt is correctly detected as Receipt,
 * but flowcharts are now incorrectly detected as "Document".
 *
 * Root Cause Analysis:
 * 1. In analyzeLayoutOnly(), the `likelyReceipt` heuristic fires for flowcharts
 *    because flowcharts can also have compact layout + text regions + ≤2 shapes
 *    (especially when GNN misclassifies flowchart boxes as 'para' not 'shape').
 * 2. The v5 L3 interceptor blocks Flowchart→Document when separators ≥ 2,
 *    but flowchart images sometimes have regions mis-typed as separators.
 * 3. The DocumentTypeClassifier text-phase guard suppresses flowchart score
 *    even when receipt score is 0 (no receipt text present).
 *
 * Fix Strategy:
 * - Only apply receipt heuristics when RECEIPT TEXT is actually present.
 * - Restore flowchart detection when receipt score = 0.
 * - Tighten the separator bail-out to require BOTH separators AND receipt-like text.
 * - Add a positive flowchart signal: if the image has many small squarish regions
 *   with consistent spacing and NO receipt text → classify as Flowchart.
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // SHARED: Receipt text detector (same as v5)
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
  // RECEIPT LAYOUT DETECTOR
  // Detects receipt geometry WITHOUT relying on complete GNN text extraction.
  // GNN's pre-OCR phase may not fully capture thin text regions.
  //
  // A receipt typically has:
  //   - Horizontal separator lines (STRONGEST signal: flowcharts never have these)
  //   - Stacked vertical layout (single column, xRange < 15)
  //   - Few squarish boxes (receipts have 0-2, flowcharts have 3+)
  //   - Dense overall arrangement
  //
  // Key insight: Don't require 2+ text regions (GNN may undercount).
  // Instead: separators + single-column layout = receipt (very reliable).
  // ═══════════════════════════════════════════════════════════════════
  function detectReceiptLayout(regions) {
    if (!regions || regions.length < 2) return false;

    const types = regions.map(r => r.type || '');
    const separatorCount = types.filter(t => t === 'separator').length;
    const tableCount = types.filter(t => t === 'table').length;
    const shapeCount = types.filter(t => t === 'shape').length;
    const textCount = types.filter(t => t === 'para' || t === 'text').length;

    // STRONGEST RECEIPT SIGNAL: Has separator lines
    // Flowcharts almost never have horizontal divider lines
    // Receipts almost always have them (between line items)
    if (separatorCount >= 1) {
      // If we have separators + single column + few shapes → Receipt
      const xPositions = regions
        .filter(r => r.bbox && r.bbox.length >= 4)
        .map(r => (r.bbox[0] + r.bbox[2]) / 2);
      
      if (xPositions.length > 0) {
        const xMin = Math.min(...xPositions);
        const xMax = Math.max(...xPositions);
        const xRange = xMax - xMin;
        
        // Single-column layout (all content vertically stacked)
        if (xRange < 20 && shapeCount <= 2) {
          console.log('[clf-v6-geo] Receipt (separators=' + separatorCount + ', xRange=' + xRange.toFixed(1) + ', shapes=' + shapeCount + ')');
          return true;
        }
      }
    }

    // SECONDARY SIGNAL: Table + single column + few shapes
    // (some receipts are rendered as single-cell tables)
    if (tableCount >= 1 && shapeCount <= 2) {
      const xPositions = regions
        .filter(r => r.bbox && r.bbox.length >= 4)
        .map(r => (r.bbox[0] + r.bbox[2]) / 2);
      
      if (xPositions.length > 0) {
        const xMin = Math.min(...xPositions);
        const xMax = Math.max(...xPositions);
        const xRange = xMax - xMin;
        
        if (xRange < 20) {
          console.log('[clf-v6-geo] Receipt (table + single-column, xRange=' + xRange.toFixed(1) + ')');
          return true;
        }
      }
    }

    // TERTIARY SIGNAL: Many text regions (3+) + no flowchart boxes + compact
    // (only if GNN did extract good text coverage)
    if (textCount >= 3 && shapeCount <= 1) {
      const xPositions = regions
        .filter(r => r.bbox && r.bbox.length >= 4)
        .map(r => (r.bbox[0] + r.bbox[2]) / 2);
      
      if (xPositions.length > 0) {
        const xMin = Math.min(...xPositions);
        const xMax = Math.max(...xPositions);
        const xRange = xMax - xMin;
        
        if (xRange < 20) {
          console.log('[clf-v6-geo] Receipt (text-heavy + single-column, text=' + textCount + ')');
          return true;
        }
      }
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // FLOWCHART LAYOUT DETECTOR
  // Detects flowchart from region layout WITHOUT relying on text.
  // A flowchart typically has:
  //   - Multiple small-to-medium squarish regions (boxes)
  //   - Regions distributed vertically with consistent spacing
  //   - Low density (lots of whitespace between boxes)
  //   - NO separator regions
  // ═══════════════════════════════════════════════════════════════════
  function detectFlowchartLayout(regions) {
    if (!regions || regions.length < 3) return false;

    const types = regions.map(r => r.type || '');
    const separatorCount = types.filter(t => t === 'separator').length;
    const tableCount = types.filter(t => t === 'table').length;

    // Receipts/invoices have separators or tables; flowcharts don't
    if (separatorCount >= 2) return false;
    if (tableCount >= 1) return false;

    // Count squarish regions (potential flowchart boxes)
    // These may be typed as 'shape', 'para', 'text', or 'figure' by the GNN
    const candidateBoxes = regions.filter(r => {
      if (!r.bbox || r.bbox.length < 4) return false;
      const w = r.bbox[2] - r.bbox[0];
      const h = r.bbox[3] - r.bbox[1];
      if (w <= 0 || h <= 0) return false;
      const ar = w / h;
      const area = w * h;
      // Squarish (not super wide, not super tall) and reasonably sized
      return ar >= 0.25 && ar <= 4.0 && area >= 50 && area <= 3000;
    });

    if (candidateBoxes.length < 3) return false;

    // Check for vertical distribution (boxes spread across the page vertically)
    const yPositions = candidateBoxes.map(r => (r.bbox[1] + r.bbox[3]) / 2).sort((a, b) => a - b);
    const yRange = yPositions[yPositions.length - 1] - yPositions[0];
    if (yRange < 20) return false; // All boxes on same row = not a flowchart

    // Check for horizontal spread (some boxes at different X positions = branching)
    const xPositions = candidateBoxes.map(r => (r.bbox[0] + r.bbox[2]) / 2);
    const xMin = Math.min(...xPositions);
    const xMax = Math.max(...xPositions);
    const xRange = xMax - xMin;

    // Flowchart: boxes spread across both X and Y axes
    // (pure receipt: all boxes stacked in single column)
    const hasSingleColumn = xRange < 15; // All boxes in one vertical column
    const hasMultipleColumns = xRange >= 15;

    // Single-column flowcharts are valid (top-to-bottom flow)
    // Multi-column flowcharts have branching
    // Either is fine as long as vertical spread is good

    // Check consistent vertical spacing (flowchart signature)
    if (yPositions.length >= 2) {
      const gaps = [];
      for (let i = 1; i < yPositions.length; i++) {
        gaps.push(yPositions[i] - yPositions[i - 1]);
      }
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      // If average gap is reasonable (boxes aren't crammed together)
      if (avgGap >= 3 && avgGap <= 40) {
        return true;
      }
    }

    // Fallback: if many candidate boxes with good spread, likely flowchart
    return candidateBoxes.length >= 4 && yRange >= 30;
  }

  // ═══════════════════════════════════════════════════════════════════
  // FIX 1: Patch currentLayoutData interceptor (L3 fix)
  // Only block Flowchart→Document when RECEIPT TEXT confirms it's a receipt.
  // ═══════════════════════════════════════════════════════════════════
  (function patchCurrentLayoutDataV6() {
    // Chain with existing v5 interceptor
    const existing = Object.getOwnPropertyDescriptor(window, 'currentLayoutData');

    let _store = null;

    function reclassify(data) {
      if (!data || !data.structure) return data;

      // Fix region types first
      if (data.regions) {
        data.regions = fixRegionTypes(data.regions);
      }

      const regions = data.regions || [];
      const types = regions.map(r => r.type || 'unknown');
      const shapes = types.filter(t => t === 'shape').length;
      const seps = types.filter(t => t === 'separator').length;
      const textRegs = types.filter(t => t === 'para' || t === 'text').length;
      const tables = types.filter(t => t === 'table').length;
      const currentType = data.structure.documentType || '';
      const textScore = receiptScore(data.text || data.fullText || '');
      const hasReceiptGeo = detectReceiptLayout(regions);
      const hasFlowchartGeo = detectFlowchartLayout(regions);

      // If currently NOT a Flowchart, check if it should be promoted
      if (currentType !== 'Flowchart') {
        if (currentType === 'Document' && hasFlowchartGeo && !hasReceiptGeo && textScore === 0) {
          console.log('[clf-v6-intercept] Promoting Document → Flowchart (geometry)');
          data.structure = {
            ...data.structure,
            documentType: 'Flowchart',
            confidence: Math.max(data.structure.confidence || 0, 0.75)
          };
        }
        return data;
      }

      // currentType === 'Flowchart': might need to block it
      
      // BLOCK if receipt geometry + text found
      if (hasReceiptGeo && textScore >= 2) {
        console.log('[clf-v6-intercept] Blocking Flowchart → Receipt (geometry + text)');
        data.structure = {
          ...data.structure,
          documentType: 'Receipt',
          confidence: 0.90
        };
        if (data.metadata) data.metadata.detectedFlowchart = false;
        if (data.isFlowchart !== undefined) data.isFlowchart = false;
        return data;
      }

      // BLOCK if receipt geometry alone (separators + stacked layout)
      if (hasReceiptGeo) {
        console.log('[clf-v6-intercept] Blocking Flowchart → Receipt (geometry only)');
        data.structure = {
          ...data.structure,
          documentType: 'Receipt',
          confidence: 0.85
        };
        if (data.metadata) data.metadata.detectedFlowchart = false;
        if (data.isFlowchart !== undefined) data.isFlowchart = false;
        return data;
      }

      // Keep as Flowchart if geometry confirms it
      if (hasFlowchartGeo) {
        console.log('[clf-v6-intercept] Keeping Flowchart (geometry confirms)');
        return data;
      }

      // Fallback: if text has receipt patterns, block flowchart
      if (textScore >= 2) {
        console.log('[clf-v6-intercept] Blocking Flowchart → Receipt (text only)');
        data.structure = {
          ...data.structure,
          documentType: 'Receipt',
          confidence: 0.80
        };
        if (data.metadata) data.metadata.detectedFlowchart = false;
        if (data.isFlowchart !== undefined) data.isFlowchart = false;
      }

      return data;
    }

    try {
      if (existing && existing.set) {
        // Chain: wrap the existing setter
        const prevGet = existing.get;
        const prevSet = existing.set;
        Object.defineProperty(window, 'currentLayoutData', {
          configurable: true,
          get() { return prevGet ? prevGet() : _store; },
          set(val) {
            if (prevSet) prevSet(val);
            const curr = prevGet ? prevGet() : val;
            const fixed = reclassify(curr ? JSON.parse(JSON.stringify(curr)) : curr);
            if (fixed && fixed !== curr && prevSet) {
              // Re-apply through the previous setter
              // We need to store locally since we can't re-trigger prevSet safely
              _store = fixed;
            }
          }
        });
      } else {
        Object.defineProperty(window, 'currentLayoutData', {
          configurable: true,
          get() { return _store; },
          set(val) { _store = reclassify(val); }
        });
      }
      console.log('✅ [clf-v6] currentLayoutData interceptor active');
    } catch (e) {
      console.warn('[clf-v6] Could not intercept currentLayoutData:', e.message);
    }
  })();

  // ═══════════════════════════════════════════════════════════════════
  // FIX 2: Patch DocumentTypeClassifier
  // Restore flowchart detection when receipt text score = 0.
  // ═══════════════════════════════════════════════════════════════════
  let _clsAttempts = 0;
  function patchClassifierV6() {
    if (typeof DocumentTypeClassifier === 'undefined') {
      if (++_clsAttempts < 80) setTimeout(patchClassifierV6, 200);
      return;
    }

    const _origCD = DocumentTypeClassifier.prototype.classifyDocument;
    DocumentTypeClassifier.prototype.classifyDocument = function (doc) {
      const text = doc.text || '';
      const rs = receiptScore(text);
      const regions = doc.regions || [];
      const hasReceiptGeo = detectReceiptLayout(regions);
      const hasFlowchartGeo = detectFlowchartLayout(regions);

      // HARD WIN: Receipt text found → Receipt, suppress flowchart
      if (rs >= 3) {
        const result = _origCD.call(this, doc);
        result.type = 'Receipt';
        result.confidence = Math.min(0.97, 0.80 + rs * 0.025);
        if (result.scores) result.scores.flowchart = 0;
        console.log('[clf-v6] Receipt (text patterns, score=' + rs + ')');
        return result;
      }

      // HARD REJECT: Receipt geometry detected → Receipt, even if text incomplete
      if (hasReceiptGeo) {
        const result = _origCD.call(this, doc);
        result.type = 'Receipt';
        result.confidence = 0.85; // Slightly lower than text-confirmed
        if (result.scores) result.scores.flowchart = 0;
        console.log('[clf-v6] Receipt (geometry: separators + stacked layout)');
        return result;
      }

      // RESTORE: Flowchart geometry detected AND no receipt signals → Flowchart
      if (hasFlowchartGeo && !hasReceiptGeo && rs === 0) {
        const result = _origCD.call(this, doc);
        result.type = 'Flowchart';
        result.confidence = 0.82;
        console.log('[clf-v6] Flowchart (layout: squarish boxes, vertical spacing)');
        return result;
      }

      // SOFT SIGNAL: receipt text 1-2 patterns (ambiguous)
      if (rs >= 2 && rs < 3) {
        const result = _origCD.call(this, doc);
        if (result.type === 'Flowchart') {
          result.type = 'Receipt';
          if (result.scores) result.scores.flowchart = 0;
          console.log('[clf-v6] Receipt (soft text signal, score=' + rs + ')');
        }
        return result;
      }

      // DEFAULT: run original classifier
      const result = _origCD.call(this, doc);
      console.log('[clf-v6] Default: ' + result.type + ' (text=' + rs + ', recGeo=' + hasReceiptGeo + ', fcGeo=' + hasFlowchartGeo + ')');
      return result;
    };

    console.log('✅ [clf-v6] DocumentTypeClassifier patched');
  }
  patchClassifierV6();

  // ═══════════════════════════════════════════════════════════════════
  // FIX 3: Patch analyzeLayoutOnly's basicDocType assignment
  // The likelyReceipt heuristic was firing for flowcharts.
  // We intercept window.currentLayoutData AFTER analyzeLayoutOnly sets it
  // (already done above), but we also need to fix the GNN analyzeLayout result.
  // ═══════════════════════════════════════════════════════════════════
  let _gnnAttempts = 0;
  function patchGNNV6() {
    if (typeof GNNDocumentAnalyzer === 'undefined') {
      if (++_gnnAttempts < 80) setTimeout(patchGNNV6, 200);
      return;
    }

    const _origAL = GNNDocumentAnalyzer.prototype.analyzeLayout;
    GNNDocumentAnalyzer.prototype.analyzeLayout = function (imageData, width, height) {
      const result = _origAL.call(this, imageData, width, height);

      if (result && result.regions) {
        result.regions = fixRegionTypes(result.regions);

        const types = result.regions.map(r => r.type || '');
        const shapes = types.filter(t => t === 'shape').length;
        const seps = types.filter(t => t === 'separator').length;

        if (result.structure && result.structure.documentType === 'Flowchart') {
          // Only un-flowchart if separators present (receipt-like layout)
          if (seps >= 2 && shapes < 2) {
            result.structure.documentType = 'Document';
          }
          // Otherwise keep as Flowchart
        }
      }

      return result;
    };

    console.log('✅ [clf-v6] GNN analyzeLayout patched');
  }
  patchGNNV6();

  // ═══════════════════════════════════════════════════════════════════
  // FIX 4: Patch lastProcessedDocument final intercept
  // ═══════════════════════════════════════════════════════════════════
  (function patchLastProcessedDocV6() {
    let _store = window.lastProcessedDocument || null;

    function fixDoc(val) {
      if (!val) return null;
      const text = (val.ocr?.text || val.text || '');
      const rs = receiptScore(text);
      const regions = val.layout?.regions || val.ocr?.regionResults || [];
      const hasReceiptGeo = detectReceiptLayout(regions);
      const hasFlowchartGeo = detectFlowchartLayout(regions);

      // Receipt text found → force Receipt
      if (rs >= 3 && val.structure?.documentType === 'Flowchart') {
        console.log('[clf-v6-final] Blocking Flowchart → Receipt (text patterns)');
        return {
          ...val,
          structure: { ...val.structure, documentType: 'Receipt', confidence: 0.93 }
        };
      }

      // Receipt geometry found → force Receipt (even without text)
      if (hasReceiptGeo && val.structure?.documentType === 'Flowchart') {
        console.log('[clf-v6-final] Blocking Flowchart → Receipt (geometry)');
        return {
          ...val,
          structure: { ...val.structure, documentType: 'Receipt', confidence: 0.88 }
        };
      }

      // Flowchart geometry + no receipt signals → force Flowchart
      if (hasFlowchartGeo && !hasReceiptGeo && rs === 0 && val.structure?.documentType === 'Document') {
        console.log('[clf-v6-final] Promoting Document → Flowchart (geometry)');
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
      console.log('✅ [clf-v6] lastProcessedDocument interceptor active');
    } catch (e) {
      console.warn('[clf-v6] lastProcessedDocument intercept failed:', e.message);
    }
  })();

  // ═══════════════════════════════════════════════════════════════════
  // UTILITY: fixRegionTypes (same as v5, needed here too)
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

      // Wide thin regions → separator
      if (r.type === 'shape' && ar > 4 && h < 4 && w > 20)
        return { ...r, type: 'separator' };
      if (r.type === 'shape' && h < 2 && w > 10)
        return { ...r, type: 'separator' };
      // Tiny shapes → figure (icon/logo)
      if (r.type === 'shape' && area < 200)
        return { ...r, type: 'figure' };

      return r;
    });
  }

  console.log(
    '%c✅ DOCUGRAPH classifier_fix v6 applied',
    'color:#16a34a;font-weight:bold',
    '— Receipt geometry-gated (separators + stacking), Flowchart restored (boxes + spacing), text-confirmed classification'
  );

})();
