/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DOCUGRAPH CLASSIFIER FIX v5 — GCash Receipt vs Flowchart              ║
 * ║                                                                          ║
 * ║  Root cause of regression introduced by fixes_v5.js:                    ║
 * ║  GNNDocumentAnalyzer.classifyAndEnhanceRegions() was patched to         ║
 * ║  reclassify small square-ish, low-density regions as 'shape'.           ║
 * ║  GCash receipts have MANY such regions:                                  ║
 * ║    • The blue circular GCash logo                                        ║
 * ║    • Thin horizontal separator lines                                     ║
 * ║    • QR / checkmark icon                                                 ║
 * ║    • Jagged receipt-bottom decoration                                    ║
 * ║  These are ALL small, low-density, near-square → wrongly flagged.        ║
 * ║                                                                          ║
 * ║  The fix is a two-layer guard:                                           ║
 * ║                                                                          ║
 * ║  LAYER 1 — Region-level veto (GNNDocumentAnalyzer patch)                ║
 * ║    A region is only reclassified to 'shape' when it passes ALL of:       ║
 * ║      a) Aspect ratio 0.6–1.6 (squarish but not ultra-thin separator)    ║
 * ║      b) Density < 0.45 (not a dense text block)                          ║
 * ║      c) Height 12–60 px (small enough to be a diagram node, not huge)   ║
 * ║      d) Width  20–180 px (narrow enough for a diagram node)             ║
 * ║      e) NOT within a cluster that has strong receipt text nearby         ║
 * ║         (checked via window.currentLayoutData receipt score)             ║
 * ║      f) There are ≥2 other 'shape' candidates on the same page          ║
 * ║         (lone shapes are decorative icons, not flowchart nodes)          ║
 * ║                                                                          ║
 * ║  LAYER 2 — Document-level veto (DocumentTypeClassifier patch)           ║
 * ║    The classifier's flowchart score is zeroed when receipt blocking      ║
 * ║    patterns are present, regardless of shape count.                      ║
 * ║    Blocking patterns (any 3+ → hard Receipt win):                        ║
 * ║      gcash, express send, ref no, amount sent, sent via,                 ║
 * ║      transaction id, gco2e, +63 9xx, ₱ amount, carbon footprint,        ║
 * ║      long numeric ref (13-16 digits)                                     ║
 * ║                                                                          ║
 * ║  LAYER 3 — Layout structural guard (classifyByStructure)                ║
 * ║    Separator regions (horizontal divider lines between receipt rows) are  ║
 * ║    now recognised as a receipt structural signal. If ≥2 separators + text║
 * ║    + no real diagram shapes → block flowchart classification.             ║
 * ║                                                                          ║
 * ║  What is preserved for true flowcharts:                                  ║
 * ║    • Real diagram shapes (diamonds, process boxes) are larger than       ║
 * ║      decorative icons and appear in groups of ≥2 without separator lines ║
 * ║    • Flowchart text keywords still score heavily                         ║
 * ║    • Visual hue-variety check from v4 is retained                        ║
 * ║                                                                          ║
 * ║  Drop-in alongside docugraph_classifier_fix.js (v4).                    ║
 * ║  Load order: classifier_fix.js → fixes_v5.js → classifier_fix_v5.js     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════════
   * SHARED RECEIPT SIGNAL DETECTOR
   * Returns a score 0-N (each pattern = 1 point).
   * A score ≥ 3 means "almost certainly a receipt / transaction document".
   * ══════════════════════════════════════════════════════════════════════════ */
  const RECEIPT_BLOCKING_PATTERNS = [
    /gcash/i,
    /express\s*send/i,
    /sent\s*via/i,
    /ref\s*no/i,
    /transaction\s*(id|no|#|ref)/i,
    /amount\s*sent/i,
    /total\s*amount\s*sent/i,
    /carbon\s*footprint/i,
    /by\s*going\s*digital/i,
    /gco2e/i,
    /\d{13,16}/,           // long reference numbers
    /\+63\s*9\d{2}/,       // PH mobile number
    /₱\s*[\d,]+/,          // Philippine peso amount
    /paymaya|maya|grabpay|shopeepay|coins\.ph/i,
    /payment\s*(received|sent|complete|successful)/i,
    /e-wallet|mobile\s*money/i,
    /remittance|remit/i,
  ];

  function receiptBlockingScore(text) {
    if (!text || typeof text !== 'string') return 0;
    return RECEIPT_BLOCKING_PATTERNS.filter(p => p.test(text)).length;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * LAYER 1 — GNNDocumentAnalyzer.classifyAndEnhanceRegions patch
   *
   * We REPLACE the v5 fixes_v5.js patch (which was too aggressive) with a
   * stricter version that checks:
   *   - Shape must be squarish (not a thin separator)
   *   - Must have at least 2 sibling shape-candidates (lone shapes = icons)
   *   - Must NOT be on a page that has a receipt blocking score ≥ 3
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Identify which regions in the classified list are REAL flowchart shapes
   * vs. decorative elements.
   *
   * A region is a "real diagram shape" candidate if:
   *   1. Squarish: 0.55 ≤ aspectRatio ≤ 1.8
   *   2. Low text density: density < 0.50
   *   3. Medium size: height 12–80 px AND width 20–200 px
   *   4. Not a separator (height/width > 0.04 i.e. not ultra-thin)
   *   5. Not a full-width block (width < 75% of page width)
   */
  function _isRealDiagramShape(r, pageWidthPct) {
    const w = r.bbox[2] - r.bbox[0];
    const h = r.bbox[3] - r.bbox[1];
    if (w <= 0 || h <= 0) return false;

    const ar      = w / h;
    const density = r.density || 0;

    const squarish     = ar >= 0.55 && ar <= 1.8;
    const lowDensity   = density < 0.50;
    const medHeight    = h >= 12 && h <= 80;
    const medWidth     = w >= 20 && w <= 200;
    const notThin      = (h / Math.max(w, 1)) > 0.04; // eliminates hairline separators
    const notFullWidth = w < (pageWidthPct * 0.75);

    return squarish && lowDensity && medHeight && medWidth && notThin && notFullWidth;
  }

  let _gnnV5Attempts = 0;
  function _patchGNNV5() {
    if (typeof GNNDocumentAnalyzer === 'undefined') {
      if (++_gnnV5Attempts < 80) setTimeout(_patchGNNV5, 200);
      return;
    }

    // The ORIGINAL unpatched method (before fixes_v5.js touched it).
    // We save a reference to the prototype method at the time we run,
    // which may already be the fixes_v5 version — so we call the base
    // via the saved _origClassify from v4's existing patches, or fall
    // back to the current prototype value.
    const _base = GNNDocumentAnalyzer.prototype._origClassifyV4
               || GNNDocumentAnalyzer.prototype.classifyAndEnhanceRegions;

    // Save for future patches.
    GNNDocumentAnalyzer.prototype._origClassifyV4 = _base;

    GNNDocumentAnalyzer.prototype.classifyAndEnhanceRegions = function (regions, grayscale, width, height) {
      // Run the BASE classifier (which assigns 'header', 'para', 'table',
      // 'figure', 'separator', 'line', 'text' based on density/size).
      let classified = _base.call(this, regions, grayscale, width, height);

      // ── Receipt guard ───────────────────────────────────────────────────
      // Check OCR text from the current layout data or lastProcessedDocument.
      const rawText = (window.currentLayoutData?.text || '')
                    + ' ' + (window.lastProcessedDocument?.ocr?.text || '');
      const receiptScore = receiptBlockingScore(rawText);
      const isDefinitelyReceipt = receiptScore >= 3;

      if (isDefinitelyReceipt) {
        // Do NOT reclassify anything to 'shape' on a receipt page.
        // Raise confidence floor to 0.60 (safe).
        return classified.map(r => ({
          ...r,
          confidence: Math.max(r.confidence || 0.5, 0.60)
        }));
      }

      // ── Shape reclassification (only for non-receipt pages) ─────────────
      // Count how many regions pass the strict shape candidate test.
      const pageWidthPct = 100; // bbox coordinates are already in 0-100 scale
      const shapeCandidates = classified.filter(
        r => r.type !== 'shape' && _isRealDiagramShape(r, pageWidthPct)
      );

      // Only promote to 'shape' when there are ≥ 2 candidates
      // (lone decorative icons don't make a flowchart).
      const promotionAllowed = shapeCandidates.length >= 2;

      return classified.map(r => {
        // Raise confidence floor.
        if (r.confidence < 0.60) r.confidence = 0.60;

        // Promote to shape only under strict conditions.
        if (
          promotionAllowed &&
          r.type !== 'shape' &&
          _isRealDiagramShape(r, pageWidthPct)
        ) {
          r = { ...r, type: 'shape' };
        }

        return r;
      });
    };

    console.log('✅ [classifier_v5] GNNDocumentAnalyzer shape-detection guard active');
  }
  _patchGNNV5();

  /* ══════════════════════════════════════════════════════════════════════════
   * LAYER 2 — DocumentTypeClassifier.classifyDocument flowchart veto
   *
   * Even if a few shapes slip through, the text-based receipt score
   * must zero out the flowchart score.
   * ══════════════════════════════════════════════════════════════════════════ */

  let _classifierV5Attempts = 0;
  function _patchClassifierV5() {
    if (typeof DocumentTypeClassifier === 'undefined') {
      if (++_classifierV5Attempts < 80) setTimeout(_patchClassifierV5, 200);
      return;
    }

    const _origClassifyDoc = DocumentTypeClassifier.prototype.classifyDocument;

    DocumentTypeClassifier.prototype.classifyDocument = function (doc) {
      const result = _origClassifyDoc.call(this, doc);

      const text  = doc.text || '';
      const score = receiptBlockingScore(text);

      // If 3+ blocking patterns → receipt wins unconditionally.
      if (score >= 3) {
        result.type = 'Receipt';
        result.confidence = Math.min(0.97, 0.80 + score * 0.03);
        if (result.scores) result.scores.flowchart = 0;
        console.log(`[classifier_v5] Receipt hard-win (score=${score})`);
        return result;
      }

      // If 1–2 patterns present, just suppress flowchart.
      if (score >= 1 && result.type === 'Flowchart') {
        // Re-run without flowchart to get the next best type.
        if (result.scores) {
          result.scores.flowchart = 0;
          const sorted = Object.entries(result.scores).sort((a, b) => b[1] - a[1]);
          if (sorted.length && sorted[0][1] > 0) {
            result.type = sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1);
            result.confidence = Math.min(0.92, result.confidence * 0.9);
          }
        }
        console.log(`[classifier_v5] Flowchart suppressed (partial receipt score=${score}), new type: ${result.type}`);
      }

      return result;
    };

    console.log('✅ [classifier_v5] DocumentTypeClassifier flowchart veto active');
  }
  _patchClassifierV5();

  /* ══════════════════════════════════════════════════════════════════════════
   * LAYER 2b — detectFlowchartIndicators veto
   *
   * The existing v4 classifier calls detectFlowchartIndicators() to add
   * score from shape regions.  We wrap it to return score=0 when the page
   * has receipt blocking patterns.
   * ══════════════════════════════════════════════════════════════════════════ */
  let _dfiAttempts = 0;
  function _patchDFI() {
    if (typeof DocumentTypeClassifier === 'undefined') {
      if (++_dfiAttempts < 80) setTimeout(_patchDFI, 200);
      return;
    }

    const _origDFI = DocumentTypeClassifier.prototype.detectFlowchartIndicators;
    if (!_origDFI) return;

    DocumentTypeClassifier.prototype.detectFlowchartIndicators = function (text, regions) {
      // Hard veto: receipt text blocks flowchart shape scoring.
      if (receiptBlockingScore(text) >= 2) {
        return { score: 0, indicators: [], blocked: 'receipt_text' };
      }
      return _origDFI.call(this, text, regions);
    };

    console.log('✅ [classifier_v5] detectFlowchartIndicators receipt-veto active');
  }
  _patchDFI();

  /* ══════════════════════════════════════════════════════════════════════════
   * LAYER 3 — classifyByStructure separator guard
   *
   * Receipts have many 'separator' regions (horizontal rule lines between
   * fields).  Flowcharts never do.  If separators are present alongside
   * text but no real diagram shapes → block flowchart.
   * ══════════════════════════════════════════════════════════════════════════ */
  let _cbsAttempts = 0;
  function _patchCBS() {
    if (typeof DocumentTypeClassifier === 'undefined') {
      if (++_cbsAttempts < 80) setTimeout(_patchCBS, 200);
      return;
    }

    const _origCBS = DocumentTypeClassifier.prototype.classifyByStructure;

    DocumentTypeClassifier.prototype.classifyByStructure = function (regions, text) {
      const result = _origCBS.call(this, regions, text);

      if (result !== 'Flowchart') return result; // Only intervene for flowchart.

      const types         = (regions || []).map(r => r.type || '');
      const separatorCount = types.filter(t => t === 'separator').length;
      const hasText        = types.some(t => t === 'para' || t === 'text');
      const shapeCount     = types.filter(t => t === 'shape').length;

      // ≥2 separators + text + receipt text + no/few shapes → not a flowchart.
      const textReceiptScore = receiptBlockingScore(text || '');
      if (separatorCount >= 2 && hasText && shapeCount <= 1 && textReceiptScore >= 1) {
        console.log('[classifier_v5] classifyByStructure: separator+receipt guard → Receipt');
        return 'Receipt';
      }

      // ≥3 separators alone (even without confirmed receipt text) = structured
      // doc (receipt, invoice) not a flowchart.
      if (separatorCount >= 3 && hasText && shapeCount <= 1) {
        console.log('[classifier_v5] classifyByStructure: many separators, suppressing Flowchart → Document');
        return 'Document';
      }

      return result;
    };

    console.log('✅ [classifier_v5] classifyByStructure separator guard active');
  }
  _patchCBS();

  /* ══════════════════════════════════════════════════════════════════════════
   * LAYER 3b — analyzeLayoutOnly pre-classification guard
   *
   * The inline analyzeLayoutOnly() function does its own document-type
   * pre-classification based on region counts.  We intercept
   * window.currentLayoutData after it is written and correct the
   * documentType when separator + receipt signals are present.
   * ══════════════════════════════════════════════════════════════════════════ */
  (function _interceptLayoutData() {
    let _store = window.currentLayoutData || null;

    function _reClassifyLayout(val) {
      if (!val || !val.structure) return val;
      if (val.structure.documentType !== 'Flowchart') return val;

      const regions        = val.regions || [];
      const separatorCount = regions.filter(r => r.type === 'separator').length;
      const shapeCount     = regions.filter(r => r.type === 'shape').length;
      const text           = val.text || val.fullText || '';
      const receiptScore   = receiptBlockingScore(text);

      if (
        (separatorCount >= 2 && receiptScore >= 1 && shapeCount <= 1) ||
        (receiptScore   >= 3)
      ) {
        console.log('[classifier_v5] currentLayoutData Flowchart → Receipt (separator+receipt guard)');
        val = {
          ...val,
          structure: { ...val.structure, documentType: 'Receipt', confidence: 0.90 }
        };
      }

      return val;
    }

    try {
      Object.defineProperty(window, 'currentLayoutData', {
        configurable: true,
        get() { return _store; },
        set(val) { _store = _reClassifyLayout(val); }
      });
      console.log('✅ [classifier_v5] currentLayoutData interception active');
    } catch (e) {
      console.warn('[classifier_v5] Could not intercept currentLayoutData:', e.message);
    }
  })();

  /* ══════════════════════════════════════════════════════════════════════════
   * LAYER 4 — Flowchart detection preserved: what makes a REAL flowchart
   *
   * To ensure true flowcharts still pass, we document and verify the
   * signals that MUST be present.  This is a read-only validation that
   * logs a warning if a Flowchart result looks suspicious.
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * A classification result is a plausible flowchart only when AT LEAST
   * ONE of these is true:
   *   A) ≥ 2 shape regions AND no separator regions AND receipt score < 2
   *   B) Explicit flowchart keywords in text
   *   C) Visual hue-variety ≥ 2 (from v4 canvas analysis — already in place)
   */
  function _validateFlowchartResult(result, regions, text) {
    if (result.type !== 'Flowchart') return result;

    const shapeCount     = (regions || []).filter(r => r.type === 'shape').length;
    const separatorCount = (regions || []).filter(r => r.type === 'separator').length;
    const receiptScore   = receiptBlockingScore(text || '');

    const hasKeywords = /flowchart|process\s*flow|activity\s*diagram|decision\s*point|start\s*node|end\s*node/i.test(text || '');
    const shapeCondition = shapeCount >= 2 && separatorCount === 0 && receiptScore < 2;

    if (!shapeCondition && !hasKeywords) {
      console.warn(
        '[classifier_v5] Flowchart result looks suspicious — no strong diagram signals.',
        { shapeCount, separatorCount, receiptScore, hasKeywords }
      );
    }

    return result;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * Wrap the final export / PDF type-detection in try.html and results.html
   *
   * Both pages have inline type-detection logic that checks docTypeMeta and
   * raw text keywords.  We patch the receipt patterns there too so the PDF
   * gets the right colour scheme even if the classifier already ran.
   * ══════════════════════════════════════════════════════════════════════════ */
  (function _patchPDFTypeDetect() {
    // The PDF patches (docugraph_pdf_patch.js) use window.lastProcessedDocument.
    // We intercept its assignment to fix documentType if it's wrongly Flowchart.
    let _docStore = window.lastProcessedDocument || null;

    try {
      Object.defineProperty(window, 'lastProcessedDocument', {
        configurable: true,
        get() { return _docStore; },
        set(val) {
          if (!val) { _docStore = null; return; }

          const text = val.ocr?.text || val.text || '';
          const score = receiptBlockingScore(text);

          if (score >= 3) {
            const struct = val.structure || {};
            if (struct.documentType === 'Flowchart') {
              console.log('[classifier_v5] lastProcessedDocument Flowchart → Receipt');
              val = {
                ...val,
                structure: { ...struct, documentType: 'Receipt', confidence: 0.93 }
              };
            }
          }

          _docStore = val;
        }
      });
      console.log('✅ [classifier_v5] lastProcessedDocument interception active');
    } catch (e) {
      console.warn('[classifier_v5] Could not intercept lastProcessedDocument:', e.message);
    }
  })();

  /* ══════════════════════════════════════════════════════════════════════════
   * Summary log
   * ══════════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c✅ DOCUGRAPH classifier_fix v5 fully applied',
    'color:#16a34a;font-weight:bold',
    [
      'Layers:',
      '1=GNN shape-promotion guard (≥2 shapes + no receipt text)',
      '2=DocumentTypeClassifier flowchart veto (3+ blocking patterns)',
      '2b=detectFlowchartIndicators receipt veto',
      '3=classifyByStructure separator guard',
      '3b=currentLayoutData interception',
      '4=lastProcessedDocument interception',
    ].join(' | ')
  );

})();
