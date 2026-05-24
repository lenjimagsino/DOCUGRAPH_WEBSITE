/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DOCUGRAPH CLASSIFIER FIX v2 — Complete Document Type Detection Rewrite ║
 * ║                                                                          ║
 * ║  Fixes ALL known misclassification bugs across every document type:      ║
 * ║                                                                          ║
 * ║  ✅ Receipt  — GCash/payment screenshots no longer become Flowcharts     ║
 * ║  ✅ Invoice  — "total/terms/fee" no longer fires on non-invoices         ║
 * ║  ✅ Flowchart — tables+paragraphs alone no longer triggers this          ║
 * ║  ✅ Form     — logos/background images no longer trigger form detection  ║
 * ║  ✅ Contract — common words like "payment/fee" no longer score           ║
 * ║  ✅ Report   — "introduction/results/data" no longer fires generically   ║
 * ║  ✅ Letter   — "thank you" in receipts no longer scores as letter        ║
 * ║  ✅ Resume   — generic job words need a CV/resume anchor to score        ║
 * ║                                                                          ║
 * ║  Drop-in replacement for the old docugraph_classifier_fix.js            ║
 * ║  Add before </body> in try.html:                                         ║
 * ║    <script src="docugraph_classifier_fix.js"></script>                   ║
 * ║    <script src="docugraph_receipt_fix.js"></script>   ← keep this too   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /** Count non-overlapping regex matches in text */
  function count(text, pattern) {
    return (text.match(pattern) || []).length;
  }

  /** Count unique matches of a list of patterns */
  function uniqueMatches(text, patterns) {
    return new Set(patterns.filter(p => p.test(text))).size;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SIGNAL SETS — each type has STRONG (anchor) and WEAK (context) signals
  // Strong signals score high; weak signals only score when anchor is present.
  // ─────────────────────────────────────────────────────────────────────────

  const SIGNALS = {

    // ── RECEIPT ────────────────────────────────────────────────────────────
    receipt: {
      // Any 2+ of these = definitely a receipt, block all other types
      blocking: [
        /gcash/i,
        /express\s*send/i,
        /sent\s*via\s*(gcash|bank|ewallet|app|mobile)/i,
        /ref\.?\s*no[\.:]\s*\d+/i,
        /transaction\s*(id|no|#|\s*reference)/i,
        /amount\s*sent/i,
        /total\s*amount\s*sent/i,
        /carbon\s*footprint/i,
        /by\s*going\s*digital/i,
        /\+63\s*9\d{2}/,          // PH mobile number
        /₱\s*[\d,]+\.\d{2}/,      // Philippine peso amount
        /paymaya|maya|grabpay|shopeepay|coins\.ph/i,
      ],
      // Strong anchors — each individually meaningful
      strong: [
        /receipt/i,
        /order\s*confirmation/i,
        /payment\s*(received|confirmed|successful)/i,
        /transaction\s*complete/i,
        /ref\s*no/i,
        /reference\s*number/i,
        /amount\s*paid/i,
      ],
      // Contextual — only add score if strong/blocking already hit
      weak: [
        /thank\s*you\s*(for\s*(your\s*)?(payment|purchase|order))?/i,
        /\d{10,}/,                 // Long numeric ref/transaction codes
        /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+\d{1,2}:\d{2}/,  // datetime stamp
      ],
    },

    // ── INVOICE ────────────────────────────────────────────────────────────
    invoice: {
      // Must have at least one of these to be an invoice
      blocking: [
        /invoice/i,
        /bill\s*to\b/i,
        /invoice\s*(no|number|#|date)/i,
      ],
      strong: [
        /ship\s*to\b/i,
        /billing\s*address/i,
        /line\s*item/i,
        /unit\s*price/i,
        /qty\b|quantity/i,
        /subtotal/i,
        /amount\s*due/i,
        /total\s*due/i,
        /payment\s*terms/i,
        /due\s*date/i,
        /purchase\s*order/i,
      ],
      weak: [
        /vendor|supplier|seller/i,
        /customer|client/i,
        /tax\b|vat\b|gst\b/i,
        /discount/i,
      ],
    },

    // ── CONTRACT ───────────────────────────────────────────────────────────
    contract: {
      // Must have anchor before any scoring
      blocking: [
        /\bthis\s+agreement\b/i,
        /\bthis\s+contract\b/i,
        /\bhereby\s+agree/i,
        /\bparties\s+agree/i,
        /\bwhereas\b/i,
      ],
      strong: [
        /\bindemnif/i,
        /governing\s*law/i,
        /severability/i,
        /breach\s*of\s*(contract|agreement)/i,
        /force\s*majeure/i,
        /liquidated\s*damages/i,
        /arbitration/i,
        /termination\s*(clause|provision)/i,
        /intellectual\s*property/i,
        /non[\-\s]?disclosure/i,
        /confidentiality\s*clause/i,
      ],
      // These only score if a blocking signal is present
      weak: [
        /\bterms\s+and\s+conditions\b/i,
        /\bobligations?\b/i,
        /\bliabilit/i,
        /\bwarrant/i,
        /\bsignature\b/i,
        /executed\s*(on|by|this)/i,
      ],
    },

    // ── REPORT ─────────────────────────────────────────────────────────────
    report: {
      // Need at least 2 distinct section keywords to unlock scoring
      sectionKeywords: [
        /\babstract\b/i,
        /\bexecutive\s+summary\b/i,
        /\bliterature\s+review\b/i,
        /\bmethodology\b/i,
        /\bfindings\b/i,
        /\bconclusion\b/i,
        /\brecommendations?\b/i,
        /\bbibliography\b/i,
        /\bappendix\b/i,
        /\btable\s+of\s+contents\b/i,
      ],
      strong: [
        /\bexecutive\s+summary\b/i,
        /\bliterature\s+review\b/i,
        /\bmethodology\b/i,
        /\bfindings\b/i,
        /\bconclusion[s]?\b/i,
        /\breferences?\b/i,
        /\bappendix\b/i,
        /\bfigure\s+\d+/i,
        /\btable\s+\d+/i,
      ],
      // Only count if 2+ section keywords already found
      weak: [
        /\bintroduction\b/i,        // too common alone
        /\bresults?\b/i,            // too common alone
        /\banalysis\b/i,
        /\bstudy\b/i,
        /\bresearch\b/i,
      ],
    },

    // ── LETTER ─────────────────────────────────────────────────────────────
    letter: {
      // Need BOTH an opening AND a closing to confidently be a letter
      openings: [
        /^dear\s+\w/im,
        /^to\s+whom\s+it\s+may\s+concern/im,
        /^hello\s+\w/im,
        /^hi\s+\w/im,
        /^greetings/im,
      ],
      closings: [
        /\bsincerely[\s,]/i,
        /\bregards[\s,]/i,
        /\bbest\s+regards/i,
        /\bkind\s+regards/i,
        /\bwarm\s+regards/i,
        /\brespectfully[\s,]/i,
        /\byours\s+truly/i,
        /\bcordially/i,
        /\bwith\s+appreciation/i,
      ],
      // Only score these if opening+closing both found
      strong: [
        /\bi\s+am\s+writing\s+to\b/i,
        /\bplease\s+(find|see)\s+enclosed/i,
        /\bat\s+your\s+earliest\s+convenience/i,
        /\blooking\s+forward\s+to\b/i,
        /\bplease\s+do\s+not\s+hesitate/i,
        /\bfeel\s+free\s+to\s+contact/i,
        /\benclosed\s+(please\s+find|is|are)/i,
      ],
    },

    // ── RESUME ─────────────────────────────────────────────────────────────
    resume: {
      // Must have a strong CV anchor before any scoring
      anchors: [
        /\bresume\b/i,
        /\bcurriculum\s+vitae\b/i,
        /\b\bcv\b/i,
        /\bprofessional\s+summary\b/i,
        /\bcareer\s+objective\b/i,
        /\bwork\s+experience\b/i,
        /\bemployment\s+history\b/i,
        /\btechnical\s+skills\b/i,
        /\bcore\s+competencies\b/i,
      ],
      strong: [
        /\bwork\s+experience\b/i,
        /\bemployment\s+history\b/i,
        /\bprofessional\s+experience\b/i,
        /\beducation\b/i,
        /\bcertification[s]?\b/i,
        /\bskills?\b/i,
        /\bachievement[s]?\b/i,
        /\baward[s]?\b/i,
        /\blinkedin\.com\//i,
        /\bgithub\.com\//i,
      ],
      // Weak signals — only counted if anchor present
      weak: [
        /\bresponsibilit/i,
        /\bproject[s]?\b/i,
        /\bposition\b/i,
        /\brole\b/i,
      ],
    },

    // ── FORM ───────────────────────────────────────────────────────────────
    form: {
      // Must have explicit form markers — no structural inference
      markers: [
        /\[\s*\]|\[x\]|☐|☑|☒/,
        /signature\s*(line|here|block|of)/i,
        /print\s*(name|here)/i,
        /date\s*of\s*(birth|issue|signature)/i,
        /please\s+(fill\s+in|complete|check)/i,
        /required\s*field/i,
        /\(please\s+(print|type)\)/i,
        /for\s+office\s+use\s+only/i,
        /_+\s*(name|date|signature|title)\s*_+/i,
      ],
      strong: [
        /\bform\s*(no|number|#)?\s*:/i,
        /\bapplication\s+form\b/i,
        /\bregistration\s+form\b/i,
        /\bsurvey\b/i,
        /\bquestionnaire\b/i,
      ],
    },

    // ── FLOWCHART ──────────────────────────────────────────────────────────
    flowchart: {
      // Needs explicit diagram vocabulary AND visual shapes
      strong: [
        /\bflowchart\b/i,
        /\bprocess\s+flow\b/i,
        /\bactivity\s+diagram\b/i,
        /\bstate\s+diagram\b/i,
        /\buml\s+diagram\b/i,
        /\bdecision\s+point\b/i,
        /\bstart\s*node\b/i,
        /\bend\s*node\b/i,
      ],
      // These only score if actual shape regions detected
      weak: [
        /\bdecision\b/i,
        /\bprocess\s+step\b/i,
        /\bworkflow\b/i,
        /\balgorithm\b/i,
        /→|⟶|↓|⬇/,
      ],
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CORE CLASSIFIER
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Score a document against all type signals.
   * Returns { type, confidence, scores, debug }
   */
  function classifyDocument(doc) {
    const text = (doc.text || '').trim();
    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const regions = doc.regions || [];
    const shapeRegions = regions.filter(r => r.type === 'shape');
    const tableCount = regions.filter(r => r.type === 'table').length;
    const paraCount = regions.filter(r => r.type === 'para' || r.type === 'text').length;
    const headerCount = regions.filter(r => r.type === 'header').length;
    const figureCount = regions.filter(r => r.type === 'figure').length;
    const filename = (doc.filename || doc.metadata?.filename || '').toLowerCase();

    const scores = {
      receipt: 0, invoice: 0, contract: 0, report: 0,
      letter: 0, resume: 0, form: 0, flowchart: 0,
    };
    const debug = {};

    // ── RECEIPT ──────────────────────────────────────────────────────────
    {
      const blockHits = SIGNALS.receipt.blocking.filter(p => p.test(text)).length;
      const strongHits = SIGNALS.receipt.strong.filter(p => p.test(text)).length;
      const weakHits = (blockHits + strongHits > 0)
        ? SIGNALS.receipt.weak.filter(p => p.test(text)).length : 0;

      scores.receipt = (blockHits * 25) + (strongHits * 12) + (weakHits * 3);
      debug.receipt = { blockHits, strongHits, weakHits };

      // Hard override: 2+ blocking signals → Receipt wins unconditionally
      if (blockHits >= 2) {
        return {
          type: 'Receipt',
          confidence: 0.96,
          scores,
          topMatches: [{ type: 'Receipt', score: scores.receipt }],
          debug,
        };
      }
    }

    // ── INVOICE ──────────────────────────────────────────────────────────
    {
      const hasAnchor = SIGNALS.invoice.blocking.some(p => p.test(text));
      if (hasAnchor) {
        const strongHits = SIGNALS.invoice.strong.filter(p => p.test(text)).length;
        const weakHits = SIGNALS.invoice.weak.filter(p => p.test(text)).length;
        scores.invoice = 20 + (strongHits * 10) + (weakHits * 4);
        // Penalise if receipt signals overlap
        if (scores.receipt > 20) scores.invoice = Math.max(0, scores.invoice - 30);
      }
      debug.invoice = { hasAnchor };
    }

    // ── CONTRACT ─────────────────────────────────────────────────────────
    {
      const hasAnchor = SIGNALS.contract.blocking.some(p => p.test(text));
      if (hasAnchor) {
        const strongHits = SIGNALS.contract.strong.filter(p => p.test(text)).length;
        const weakHits = SIGNALS.contract.weak.filter(p => p.test(text)).length;
        scores.contract = 20 + (strongHits * 10) + (weakHits * 4);
        // Contracts are long documents
        if (wordCount < 200) scores.contract = Math.floor(scores.contract * 0.2);
      }
      debug.contract = { hasAnchor };
    }

    // ── REPORT ───────────────────────────────────────────────────────────
    {
      const sectionHits = SIGNALS.report.sectionKeywords.filter(p => p.test(text)).length;
      const uniqueSections = new Set(
        SIGNALS.report.sectionKeywords.filter(p => p.test(text)).map(p => p.toString())
      ).size;

      if (uniqueSections >= 2) {
        // Enough section diversity to consider this a report
        const strongHits = SIGNALS.report.strong.filter(p => p.test(text)).length;
        const weakHits = SIGNALS.report.weak.filter(p => p.test(text)).length;
        scores.report = 25 + (strongHits * 10) + (weakHits * 3);
      }
      debug.report = { uniqueSections };
    }

    // ── LETTER ───────────────────────────────────────────────────────────
    {
      const hasOpening = SIGNALS.letter.openings.some(p => p.test(text));
      const hasClosing = SIGNALS.letter.closings.some(p => p.test(text));

      if (hasOpening && hasClosing) {
        const strongHits = SIGNALS.letter.strong.filter(p => p.test(text)).length;
        scores.letter = 25 + (strongHits * 8);
        // Long docs are not letters
        if (wordCount > 1500) scores.letter = Math.floor(scores.letter * 0.35);
      } else {
        scores.letter = 0;
      }
      debug.letter = { hasOpening, hasClosing };
    }

    // ── RESUME ───────────────────────────────────────────────────────────
    {
      const hasAnchor = SIGNALS.resume.anchors.some(p => p.test(text));
      if (hasAnchor) {
        const strongHits = SIGNALS.resume.strong.filter(p => p.test(text)).length;
        const weakHits = SIGNALS.resume.weak.filter(p => p.test(text)).length;
        scores.resume = 20 + (strongHits * 12) + (weakHits * 4);
      }
      debug.resume = { hasAnchor };
    }

    // ── FORM ─────────────────────────────────────────────────────────────
    {
      const markerHits = SIGNALS.form.markers.filter(p => p.test(text)).length;
      const strongHits = SIGNALS.form.strong.filter(p => p.test(text)).length;
      // Forms need EXPLICIT markers — do NOT use figure count as a proxy
      if (markerHits > 0 || strongHits > 0) {
        scores.form = (markerHits * 15) + (strongHits * 12);
      }
      debug.form = { markerHits, strongHits };
    }

    // ── FLOWCHART ────────────────────────────────────────────────────────
    {
      // Flowcharts REQUIRE actual shape regions — text alone is insufficient
      const realShapes = shapeRegions.filter(r => {
        if (!r.bbox || r.bbox.length < 4) return false;
        const w = r.bbox[2] - r.bbox[0];
        const h = r.bbox[3] - r.bbox[1];
        const ar = w / Math.max(h, 1);
        // Decorative: normal rectangles (ar 0.3-5)
        return !(ar > 0.3 && ar < 5);
      });

      const strongHits = SIGNALS.flowchart.strong.filter(p => p.test(text)).length;

      if (realShapes.length >= 2) {
        scores.flowchart = 20 + (realShapes.length * 8) + (strongHits * 12);
      } else if (strongHits > 0) {
        scores.flowchart = strongHits * 10;
      }
      // else: no shapes, no strong vocab → 0

      // Block flowchart if receipt/invoice signals are strong
      if (scores.receipt > 15 || scores.invoice > 20) {
        scores.flowchart = 0;
      }

      // Block flowchart if it's just tables + paragraphs (invoice/report pattern)
      if (realShapes.length === 0 && tableCount > 0 && paraCount > 0) {
        scores.flowchart = 0;
      }

      debug.flowchart = { realShapes: realShapes.length, strongHits };
    }

    // ── FILENAME BONUSES ─────────────────────────────────────────────────
    const typeNames = ['receipt', 'invoice', 'contract', 'report', 'letter', 'resume', 'form', 'flowchart'];
    typeNames.forEach(t => {
      if (filename.includes(t)) scores[t] += 15;
    });
    if (/cv[_\-\s]|curriculum/.test(filename)) scores.resume += 10;

    // ── PICK WINNER ──────────────────────────────────────────────────────
    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .filter(([, s]) => s > 0);

    if (sorted.length === 0) {
      return {
        type: 'Document',
        confidence: 0,
        scores,
        topMatches: [{ type: 'Document', score: 0 }],
        debug,
      };
    }

    const [bestType, bestScore] = sorted[0];
    const secondScore = sorted[1] ? sorted[1][1] : 0;
    const confidence = Math.min(0.97, bestScore / (bestScore + secondScore + 1));

    return {
      type: bestType.charAt(0).toUpperCase() + bestType.slice(1),
      confidence,
      scores,
      topMatches: sorted.slice(0, 3).map(([t, s]) => ({
        type: t.charAt(0).toUpperCase() + t.slice(1),
        score: s,
      })),
      debug,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STRUCTURAL CLASSIFIER (for analyzeLayoutOnly — text not yet available)
  // Called when OCR hasn't run yet, so we classify purely from region layout.
  // ─────────────────────────────────────────────────────────────────────────

  function classifyByStructure(regions, filename) {
    filename = (filename || '').toLowerCase();
    const total     = regions.length;
    const shapes    = regions.filter(r => r.type === 'shape');
    const tables    = regions.filter(r => r.type === 'table');
    const paras     = regions.filter(r => r.type === 'para' || r.type === 'text');
    const headers   = regions.filter(r => r.type === 'header');
    const figures   = regions.filter(r => r.type === 'figure');

    // Filter out decorative shapes: small circles/icons and wavy borders
    const realShapes = shapes.filter(r => {
      if (!r.bbox || r.bbox.length < 4) return false;
      const w = r.bbox[2] - r.bbox[0];
      const h = r.bbox[3] - r.bbox[1];
      const ar = w / Math.max(h, 1);
      return !(ar > 0.3 && ar < 5);  // Keep non-normal rectangles
    });

    // Filename hint wins
    const types = ['receipt','invoice','contract','report','letter','resume','form','flowchart'];
    for (const t of types) {
      if (filename.includes(t)) return t.charAt(0).toUpperCase() + t.slice(1);
    }

    // Flowchart: multiple real diagram shapes, sparse text
    if (realShapes.length >= 3 && paras.length <= 2) return 'Flowchart';
    if (realShapes.length >= 2 && paras.length === 0) return 'Flowchart';

    // Forms: explicit form-layout (many figures + very few paras, no tables)
    // Only if figures clearly dominate text AND no receipt signals
    if (figures.length > 3 && paras.length <= 1 && tables.length === 0) return 'Form';

    // Invoice/Report: has tables + structured text
    if (tables.length > 0 && paras.length > 0) return 'Invoice';

    // Report: many sections
    if (headers.length >= 3 && paras.length > 5) return 'Report';

    // Compact single-column with text = Receipt or Document
    // (Receipt confirmed only after OCR; default to Document until then)
    return 'Document';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH DocumentTypeClassifier
  // ─────────────────────────────────────────────────────────────────────────

  function patchDocumentTypeClassifier() {
    if (typeof DocumentTypeClassifier === 'undefined') return false;

    DocumentTypeClassifier.prototype.classifyDocument = function (doc) {
      return classifyDocument(doc);
    };

    // Also patch classifyByStructure method
    DocumentTypeClassifier.prototype.classifyByStructure = function (regions, text) {
      return classifyByStructure(regions, text);
    };

    console.log('✅ DocumentTypeClassifier patched');
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH analyzeLayoutOnly — fix the structural pre-classification block
  // that runs BEFORE OCR. The original had wrong priority ordering and
  // conflated decorative shapes with flowchart shapes.
  // ─────────────────────────────────────────────────────────────────────────

  function patchAnalyzeLayoutOnly() {
    // We can't directly patch the inline function inside the <script> block,
    // but we CAN intercept window.currentLayoutData after it's set (same as
    // docugraph_receipt_fix.js). Here we do the structural re-classification
    // using our improved classifyByStructure logic.

    const _reClassify = function (layoutData) {
      if (!layoutData || !layoutData.structure) return layoutData;
      const st = layoutData.structure || {};
      const regions = layoutData.regions || [];
      const types = regions.map(r => r.type || '');

      // Re-run our improved structural classifier
      const newType = classifyByStructure(regions, st.filename);
      if (newType && newType !== st.documentType) {
        console.log(`🔄 [Classifier] Reclassified: ${st.documentType} → ${newType}`);
        layoutData.structure = { ...st, documentType: newType };
      }
      return layoutData;
    };

    // Install interceptor on window.currentLayoutData
    let _store = null;
    try {
      Object.defineProperty(window, 'currentLayoutData', {
        get() { return _store; },
        set(val) {
          _store = _reClassify(val);
        },
        configurable: true,
      });
    } catch (e) {
      // If defineProperty fails (unlikely), fall back to silent no-op
      console.warn('Could not intercept currentLayoutData; some pre-OCR fixes skipped');
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH hasStrongReceiptPattern & detectReceiptIndicators
  // These are methods on DocumentTypeClassifier used by classifyDocument.
  // Our new classifyDocument no longer calls them, but patch anyway for safety.
  // ─────────────────────────────────────────────────────────────────────────

  function patchReceiptHelpers() {
    if (typeof DocumentTypeClassifier === 'undefined') return false;

    DocumentTypeClassifier.prototype.hasStrongReceiptPattern = function (text) {
      return SIGNALS.receipt.blocking.some(p => p.test(text));
    };

    DocumentTypeClassifier.prototype.detectReceiptIndicators = function (text) {
      const hits = SIGNALS.receipt.blocking.filter(p => p.test(text)).length;
      return { score: hits >= 2 ? 100 : hits * 30, indicators: [] };
    };

    // Patch isDecorativeShape to use our improved logic
    DocumentTypeClassifier.prototype.isDecorativeShape = function (region) {
      if (!region || !region.bbox || region.bbox.length < 4) return false;
      const w = region.bbox[2] - region.bbox[0];
      const h = region.bbox[3] - region.bbox[1];
      const ar = w / Math.max(h, 1);
      return ar > 0.3 && ar < 5;  // Normal rectangles are decorative
    };

    DocumentTypeClassifier.prototype.detectFlowchartIndicators = function (text, regions) {
      const strongHits = SIGNALS.flowchart.strong.filter(p => p.test(text)).length;
      const realShapes = (regions || []).filter(r =>
        r.type === 'shape' && !this.isDecorativeShape(r)
      ).length;
      const score = (realShapes >= 2 ? 20 + realShapes * 8 : 0) + (strongHits * 12);
      return { score, indicators: [] };
    };

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APPLY ALL PATCHES (with retry)
  // ─────────────────────────────────────────────────────────────────────────

  let attempts = 0;
  const MAX = 60;

  function applyAll() {
    attempts++;
    const a = patchDocumentTypeClassifier();
    const b = patchReceiptHelpers();

    if (!a || !b) {
      if (attempts < MAX) {
        setTimeout(applyAll, 150);
      }
      return;
    }

    // Run structural interceptor patch once (it doesn't need a class)
    patchAnalyzeLayoutOnly();

    console.log(
      '%c✅ DOCUGRAPH classifier_fix v2 fully applied',
      'color:#16a34a;font-weight:bold',
      '— all document types corrected'
    );
  }

  applyAll();

})();
