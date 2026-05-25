/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DOCUGRAPH CLASSIFIER FIX v5 — GCash Receipt vs Flowchart              ║
 * ║                                                                          ║
 * ║  ROOT CAUSE:                                                             ║
 * ║  The GCash receipt is misclassified as Flowchart during the PRE-OCR      ║
 * ║  layout analysis phase (analyzeLayoutOnly), where NO text is available.  ║
 * ║  The GNN layout engine labels these receipt elements as 'shape':         ║
 * ║    - Blue circular GCash logo                                            ║
 * ║    - Checkmark icon                                                      ║
 * ║    - Horizontal separator lines (thin rules between rows)                ║
 * ║    - Jagged bottom-edge receipt decoration                               ║
 * ║  With ≥3 shapes detected, the pre-OCR basicDocType logic sets            ║
 * ║  documentType = 'Flowchart', and this sticks throughout the pipeline.    ║
 * ║                                                                          ║
 * ║  The previous v5 fix tried to guard using receipt TEXT patterns, but      ║
 * ║  at layout-analysis time there IS no text yet — only region types.       ║
 * ║                                                                          ║
 * ║  SOLUTION — 5 layers, from deepest to outermost:                         ║
 * ║                                                                          ║
 * ║  L1. GNN region reclassification:                                        ║
 * ║      Separator-like regions (aspect ratio > 5, height < 3%) are          ║
 * ║      FORCED to type='separator' regardless of what GNN assigned.         ║
 * ║      This prevents thin rule lines from counting as flowchart shapes.    ║
 * ║                                                                          ║
 * ║  L2. Shape deduplication:                                                ║
 * ║      After L1, re-count shapes. Only regions that are genuinely          ║
 * ║      squarish (0.4 ≤ AR ≤ 2.5) AND not tiny (area > 2% of page)       ║
 * ║      count as real diagram shapes. Icons/logos are filtered out.         ║
 * ║                                                                          ║
 * ║  L3. Pre-OCR structural guard (analyzeLayoutOnly):                       ║
 * ║      If ≥2 separator regions exist alongside shapes, the shapes are      ║
 * ║      likely decorative (receipt/invoice layout) not diagram nodes.       ║
 * ║      Block flowchart classification in this case.                        ║
 * ║                                                                          ║
 * ║  L4. DocumentTypeClassifier text-phase guard:                            ║
 * ║      After OCR, if receipt blocking patterns match ≥3 → Receipt wins.   ║
 * ║                                                                          ║
 * ║  L5. Final interception of window objects:                               ║
 * ║      currentLayoutData and lastProcessedDocument are intercepted to      ║
 * ║      fix any Flowchart classification when receipt text is present.       ║
 * ║                                                                          ║
 * ║  FLOWCHART PRESERVED:                                                    ║
 * ║  Real flowcharts have ≥2 large squarish boxes, NO separator regions,    ║
 * ║  and no receipt text. All checks pass cleanly.                           ║
 * ║                                                                          ║
 * ║  LOAD ORDER (last in both try.html and results.html):                    ║
 * ║    <script src="docugraph_classifier_fix.js"></script>   <!-- v4 -->     ║
 * ║    <script src="docugraph_fixes_v5.js"></script>         <!-- table -->  ║
 * ║    <script src="docugraph_classifier_fix_v5.js"></script><!-- THIS -->   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  // RECEIPT TEXT DETECTOR (used by text-phase guards L4 & L5)
  // ═══════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════
  // L1 + L2: GNN region post-processing
  //
  // Runs AFTER GNN classifies regions but BEFORE document-type assignment.
  // Fixes two problems:
  //   a) Thin horizontal rules mistyped as 'shape' → force to 'separator'
  //   b) Small icons/logos mistyped as 'shape' → force to 'figure'
  // ═══════════════════════════════════════════════════════════════════════

  function fixRegionTypes(regions) {
    if (!regions || !regions.length) return regions;

    return regions.map(r => {
      const w = r.bbox[2] - r.bbox[0];   // width in percent (0-100 scale)
      const h = r.bbox[3] - r.bbox[1];   // height in percent
      if (w <= 0 || h <= 0) return r;
      const ar = w / h;
      const area = w * h;

      // L1: Thin wide regions → separator, not shape
      // A separator line is wide (>20% page width) and thin (<4% page height)
      if (r.type === 'shape' && ar > 4 && h < 4 && w > 20) {
        return { ...r, type: 'separator' };
      }

      // L1b: Very thin lines → 'line' or 'separator'
      if (r.type === 'shape' && h < 2 && w > 10) {
        return { ...r, type: 'separator' };
      }

      // L2: Tiny shapes (area < 2% of page) → figure (icon/logo), not shape
      // Page area = 100 * 100 = 10000 in percent coordinates
      if (r.type === 'shape' && area < 200) {
        return { ...r, type: 'figure' };
      }

      // L2b: Very narrow or very tall shapes → not diagram nodes
      // Diagram boxes are squarish (AR 0.3 to 3.0)
      if (r.type === 'shape' && (ar < 0.3 || ar > 5)) {
        return { ...r, type: ar > 5 ? 'separator' : 'figure' };
      }

      return r;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // L1+L2: Patch GNNDocumentAnalyzer to run fixRegionTypes()
  // ═══════════════════════════════════════════════════════════════════════

  let _gnnAttempts = 0;
  function patchGNN() {
    if (typeof GNNDocumentAnalyzer === 'undefined') {
      if (++_gnnAttempts < 80) setTimeout(patchGNN, 200);
      return;
    }

    // Wrap classifyAndEnhanceRegions
    const _orig = GNNDocumentAnalyzer.prototype.classifyAndEnhanceRegions;
    GNNDocumentAnalyzer.prototype.classifyAndEnhanceRegions = function (regions, gs, w, h) {
      let classified = _orig.call(this, regions, gs, w, h);
      classified = fixRegionTypes(classified);

      // Raise confidence floor
      classified = classified.map(r => ({
        ...r,
        confidence: Math.max(r.confidence || 0.5, 0.60)
      }));

      return classified;
    };

    // Wrap optimizeRegions (fills gaps) to also fix types after fill
    const _origOpt = GNNDocumentAnalyzer.prototype.optimizeRegions;
    GNNDocumentAnalyzer.prototype.optimizeRegions = function (regions) {
      let result = _origOpt.call(this, regions);
      return fixRegionTypes(result);
    };

    // Wrap analyzeLayoutWithGridSegmentation for the forced-grid path
    const _origGrid = GNNDocumentAnalyzer.prototype.analyzeLayoutWithGridSegmentation;
    if (_origGrid) {
      GNNDocumentAnalyzer.prototype.analyzeLayoutWithGridSegmentation = function (imgData, w, h) {
        let result = _origGrid.call(this, imgData, w, h);
        if (result && result.regions) {
          result.regions = fixRegionTypes(result.regions);
          // Re-evaluate isFlowchart after fixing types
          const realShapes = result.regions.filter(r => r.type === 'shape').length;
          if (realShapes < 2) result.isFlowchart = false;
        }
        return result;
      };
    }

    console.log('✅ [clf-v5] L1+L2: GNN region type fixes active');
  }
  patchGNN();

  // ═══════════════════════════════════════════════════════════════════════
  // L3: Pre-OCR structural classification guard
  //
  // The analyzeLayoutOnly() function in try.html computes basicDocType
  // from region counts. We can't modify that inline function, but we CAN
  // intercept window.currentLayoutData AFTER it's set and fix the
  // documentType before anything reads it.
  //
  // Rules:
  //   - If separators ≥ 2 AND shapes ≤ 2 → NOT a flowchart
  //   - If shapes < 2 after L1+L2 filtering → NOT a flowchart
  //   - If the region mix is text-heavy (≥5 text/para regions) AND
  //     compact (total regions < 15) AND few real shapes → receipt-like
  // ═══════════════════════════════════════════════════════════════════════

  (function patchCurrentLayoutData() {
    let _store = null;

    function reclassify(data) {
      if (!data || !data.structure) return data;

      // Fix region types first (in case our GNN patch didn't run yet)
      if (data.regions) {
        data.regions = fixRegionTypes(data.regions);
      }

      const regions   = data.regions || [];
      const types     = regions.map(r => r.type || 'unknown');
      const shapes    = types.filter(t => t === 'shape').length;
      const seps      = types.filter(t => t === 'separator').length;
      const textRegs  = types.filter(t => t === 'para' || t === 'text').length;
      const tables    = types.filter(t => t === 'table').length;
      const total     = regions.length;
      const isCompact = total < 20;

      const currentType = data.structure.documentType || '';

      // Only intervene if currently classified as Flowchart
      if (currentType !== 'Flowchart') return data;

      let shouldBlock = false;
      let newType = 'Document';

      // Rule 1: Separators present → structured document, not flowchart
      if (seps >= 2 && shapes <= 2) {
        shouldBlock = true;
        newType = textRegs >= 3 ? 'Receipt' : 'Document';
      }

      // Rule 2: After L1+L2 filtering, too few real shapes
      if (shapes < 2) {
        shouldBlock = true;
        newType = seps >= 1 ? 'Receipt' : 'Document';
      }

      // Rule 3: Text-heavy compact layout with few shapes
      if (isCompact && textRegs >= 5 && shapes <= 2 && seps >= 1) {
        shouldBlock = true;
        newType = 'Receipt';
      }

      // Rule 4: Tables + separators = invoice/receipt
      if (tables >= 1 && seps >= 1 && shapes <= 2) {
        shouldBlock = true;
        newType = 'Receipt';
      }

      if (shouldBlock) {
        console.log(
          `[clf-v5] L3: Blocking Flowchart → ${newType}`,
          `(shapes=${shapes}, seps=${seps}, text=${textRegs}, tables=${tables})`
        );
        data.structure = {
          ...data.structure,
          documentType: newType,
          confidence: Math.max(data.structure.confidence || 0, 0.80)
        };

        // Also clear flowchart flags
        if (data.metadata) {
          data.metadata.detectedFlowchart = false;
        }
        if (data.isFlowchart !== undefined) {
          data.isFlowchart = false;
        }
      }

      return data;
    }

    try {
      // Check if there's already an interceptor from v4
      const descriptor = Object.getOwnPropertyDescriptor(window, 'currentLayoutData');
      if (descriptor && descriptor.set) {
        // Chain with existing setter
        const _prevSet = descriptor.set;
        const _prevGet = descriptor.get;
        Object.defineProperty(window, 'currentLayoutData', {
          configurable: true,
          get() { return _prevGet ? _prevGet() : _store; },
          set(val) {
            if (_prevSet) _prevSet(val);
            const current = _prevGet ? _prevGet() : val;
            const fixed = reclassify(current);
            if (_prevGet) {
              // The previous interceptor manages storage; we just reclassify
              // by writing back through _prevSet
              if (fixed !== current && _prevSet) {
                _store = fixed;
              }
            } else {
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
      console.log('✅ [clf-v5] L3: currentLayoutData interceptor active');
    } catch (e) {
      console.warn('[clf-v5] L3: Could not intercept currentLayoutData:', e.message);
    }
  })();

  // ═══════════════════════════════════════════════════════════════════════
  // L4: DocumentTypeClassifier text-phase guards
  // ═══════════════════════════════════════════════════════════════════════

  let _clsAttempts = 0;
  function patchClassifier() {
    if (typeof DocumentTypeClassifier === 'undefined') {
      if (++_clsAttempts < 80) setTimeout(patchClassifier, 200);
      return;
    }

    // --- classifyDocument ---
    const _origCD = DocumentTypeClassifier.prototype.classifyDocument;
    DocumentTypeClassifier.prototype.classifyDocument = function (doc) {
      const result = _origCD.call(this, doc);
      const text = doc.text || '';
      const rs = receiptScore(text);

      // Hard receipt win: 3+ patterns
      if (rs >= 3) {
        result.type = 'Receipt';
        result.confidence = Math.min(0.97, 0.80 + rs * 0.025);
        if (result.scores) result.scores.flowchart = 0;
        return result;
      }

      // Soft flowchart suppression: 1-2 patterns
      if (rs >= 1 && result.type === 'Flowchart' && result.scores) {
        result.scores.flowchart = 0;
        const sorted = Object.entries(result.scores).sort((a, b) => b[1] - a[1]);
        if (sorted.length && sorted[0][1] > 0) {
          result.type = sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1);
        } else {
          result.type = 'Receipt';
        }
      }

      return result;
    };

    // --- detectFlowchartIndicators ---
    const _origDFI = DocumentTypeClassifier.prototype.detectFlowchartIndicators;
    if (_origDFI) {
      DocumentTypeClassifier.prototype.detectFlowchartIndicators = function (text, regions) {
        if (receiptScore(text) >= 2) {
          return { score: 0, indicators: [], blocked: 'receipt' };
        }

        // Also check region types: if separators exist, reduce score
        const seps = (regions || []).filter(r => r && r.type === 'separator').length;
        const result = _origDFI.call(this, text, regions);
        if (seps >= 2 && result.score > 0) {
          result.score = Math.max(0, result.score - seps * 15);
        }
        return result;
      };
    }

    // --- classifyByStructure ---
    const _origCBS = DocumentTypeClassifier.prototype.classifyByStructure;
    DocumentTypeClassifier.prototype.classifyByStructure = function (regions, text) {
      // Fix region types before structural classification
      const fixedRegions = fixRegionTypes(regions || []);

      const result = _origCBS.call(this, fixedRegions, text);

      if (result === 'Flowchart') {
        const types = fixedRegions.map(r => r.type || '');
        const seps = types.filter(t => t === 'separator').length;
        const shapes = types.filter(t => t === 'shape').length;
        const textRegs = types.filter(t => t === 'para' || t === 'text').length;

        // Block flowchart if separators present
        if (seps >= 2 && shapes <= 2) {
          return textRegs >= 3 ? 'Receipt' : 'Document';
        }

        // Block if too few real shapes after filtering
        if (shapes < 2) {
          return 'Document';
        }

        // Block if receipt text present
        if (receiptScore(text || '') >= 1 && seps >= 1) {
          return 'Receipt';
        }
      }

      return result;
    };

    // --- isDecorativeShape ---
    DocumentTypeClassifier.prototype.isDecorativeShape = function (region) {
      if (!region || !region.bbox || !Array.isArray(region.bbox) || region.bbox.length < 4) return false;
      const w = region.bbox[2] - region.bbox[0];
      const h = region.bbox[3] - region.bbox[1];
      const ar = w / Math.max(h, 1);
      const area = w * h;

      // Decorative if:
      //   - Very wide and thin (separator line): ar > 4
      //   - Very small (icon/logo): area < 200 (in % coords)
      //   - Very narrow: ar < 0.3
      return ar > 4 || ar < 0.3 || area < 200;
    };

    console.log('✅ [clf-v5] L4: DocumentTypeClassifier guards active');
  }
  patchClassifier();

  // ═══════════════════════════════════════════════════════════════════════
  // L5: Final interception of lastProcessedDocument
  // ═══════════════════════════════════════════════════════════════════════

  (function patchLastProcessedDocument() {
    let _store = window.lastProcessedDocument || null;

    function fixDoc(val) {
      if (!val) return null;
      const text = (val.ocr?.text || val.text || '');
      const rs = receiptScore(text);

      if (rs >= 3 && val.structure?.documentType === 'Flowchart') {
        val = {
          ...val,
          structure: { ...val.structure, documentType: 'Receipt', confidence: 0.93 }
        };
      }
      return val;
    }

    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'lastProcessedDocument');
      if (desc && desc.set) {
        const _prevSet = desc.set;
        const _prevGet = desc.get;
        Object.defineProperty(window, 'lastProcessedDocument', {
          configurable: true,
          get() { return _prevGet ? _prevGet() : _store; },
          set(val) {
            val = fixDoc(val);
            if (_prevSet) _prevSet(val);
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
      console.log('✅ [clf-v5] L5: lastProcessedDocument interceptor active');
    } catch (e) {
      console.warn('[clf-v5] L5 interception failed:', e.message);
    }
  })();

  // ═══════════════════════════════════════════════════════════════════════
  // L3b: Patch the analyzeLayout() path
  //
  // The try.html analyzeLayoutOnly() calls gnnAnalyzer.analyzeLayout().
  // We patch this method to fix region types in its return value BEFORE
  // the calling code counts shapes to decide if it's a flowchart.
  // ═══════════════════════════════════════════════════════════════════════

  let _alAttempts = 0;
  function patchAnalyzeLayout() {
    if (typeof GNNDocumentAnalyzer === 'undefined') {
      if (++_alAttempts < 80) setTimeout(patchAnalyzeLayout, 200);
      return;
    }

    const _origAL = GNNDocumentAnalyzer.prototype.analyzeLayout;
    GNNDocumentAnalyzer.prototype.analyzeLayout = function (imageData, width, height) {
      const result = _origAL.call(this, imageData, width, height);

      if (result && result.regions) {
        result.regions = fixRegionTypes(result.regions);

        // Recount after fixing
        const shapes = result.regions.filter(r => r.type === 'shape').length;
        const seps   = result.regions.filter(r => r.type === 'separator').length;

        // Update structure if it was set
        if (result.structure && result.structure.documentType === 'Flowchart') {
          if (shapes < 2 || seps >= 2) {
            result.structure.documentType = 'Document';
          }
        }
      }

      return result;
    };

    console.log('✅ [clf-v5] L3b: GNN analyzeLayout post-fix active');
  }
  patchAnalyzeLayout();

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════
  console.log(
    '%c✅ DOCUGRAPH classifier_fix v5 applied',
    'color:#16a34a;font-weight:bold',
    '— L1:separator-retype L2:icon-filter L3:pre-OCR-guard L4:text-guard L5:final-intercept'
  );

})();
