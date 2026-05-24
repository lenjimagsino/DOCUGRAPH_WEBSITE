/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║  DOCUGRAPH CLASSIFIER FIX — Document Type Detection Correction     ║
 * ║                                                                    ║
 * ║  Fixes false-positive classification that was confusing receipt,  ║
 * ║  invoice, contract, report, letter, resume, and form detection.   ║
 * ║                                                                    ║
 * ║  Apply: Add this before </body> in try.html:                      ║
 * ║  <script src="docugraph_classifier_fix.js"></script>              ║
 * ╚════════════════════════════════════════════════════════════════════╝
 */

(function() {
  'use strict';

  // Wait for GNNDocumentAnalyzer to be loaded
  const waitForAnalyzer = () => {
    if (typeof window.GNNDocumentAnalyzer !== 'undefined') {
      patchClassifiers();
    } else {
      setTimeout(waitForAnalyzer, 100);
    }
  };

  function patchClassifiers() {
    const GNN = window.GNNDocumentAnalyzer;
    if (!GNN || !GNN.prototype) return;

    // Store original classifier scores function
    const origComputeScores = GNN.prototype.computeDocumentTypeScores || GNN.prototype._computeDocumentTypeScores;
    if (!origComputeScores) return;

    /**
     * Patched classifier that fixes false positives for each document type
     */
    GNN.prototype.computeDocumentTypeScores = function(text) {
      const scores = {
        receipt: 0,
        invoice: 0,
        contract: 0,
        report: 0,
        letter: 0,
        resume: 0,
        form: 0,
        flowchart: 0,
      };

      if (!text || text.length === 0) return scores;

      const lowerText = text.toLowerCase();
      const wordCount = text.split(/\s+/).length;
      const lines = text.split('\n');

      // ─────────────────────────────────────────────────────────────
      // RECEIPT CLASSIFIER (FIXED)
      // ─────────────────────────────────────────────────────────────
      // Contact fields only count when form anchors are present
      const hasFormMarker = /checkbox|signature|please\s*fill|form\s*field|\[.*\]|☐|☑/i.test(text);
      const contactKeywords = (lowerText.match(/address|phone|email|sender|recipient/g) || []).length;
      
      if (/gcash|receipt|transaction\s*(id|no)|ref\s*no|amount\s*sent|amount\s*paid/i.test(text)) {
        scores.receipt += 20;
      }
      if (/transaction|ref\s*no|transaction\s*id/i.test(text)) {
        scores.receipt += 15;
      }
      if (/date[\s:]+\d{1,2}\/\d{1,2}|time[\s:]+\d{1,2}:\d{2}/i.test(text)) {
        scores.receipt += 10;
      }
      // Contact fields only count if form marker is absent (not a form)
      if (!hasFormMarker && contactKeywords > 0) {
        scores.receipt += contactKeywords * 2; // Reduced from 8pts each
      }
      if (/payment\s*method|mobile|gcash|bpi|bdo|metrobank/i.test(text)) {
        scores.receipt += 8;
      }

      // ─────────────────────────────────────────────────────────────
      // INVOICE CLASSIFIER (FIXED)
      // ─────────────────────────────────────────────────────────────
      // Require invoice-specific phrasing; subtract when receipt signals present
      const hasReceiptSignals = /gcash|transaction\s*(id|no)|ref\s*no|amount\s*sent/i.test(text);
      
      if (/invoice|bill|invoice\s*no|invoice\s*number|billing/i.test(text)) {
        scores.invoice += 25;
      }
      if (/bill\s*to|ship\s*to|customer|qty|unit\s*price|line\s*item/i.test(text)) {
        scores.invoice += 15;
      }
      if (/subtotal|tax\s*amount|total\s*due|amount\s*due|balance/i.test(text)) {
        scores.invoice += 12;
      }
      if (/payment\s*terms|due\s*date|invoice\s*date|issued/i.test(text)) {
        scores.invoice += 10;
      }
      // Subtract invoice score when receipt signals are strong
      if (hasReceiptSignals) {
        scores.invoice -= 30;
      }

      // ─────────────────────────────────────────────────────────────
      // CONTRACT CLASSIFIER (FIXED)
      // ─────────────────────────────────────────────────────────────
      // Weak legal terms only count when strong anchors present
      const hasStrongLegalAnchor = /whereas|indemnify|governing\s*law|severability|breach|remedies|executed|date.*signature/i.test(text);
      const weakLegalTerms = (lowerText.match(/terms|conditions|obligations|payment|fee|liability|warranty/g) || []).length;
      
      if (/agreement|contract|this\s*agreement|parties|party/i.test(text)) {
        scores.contract += 20;
      }
      if (/whereas|consideration|recitals|covenants/i.test(text)) {
        scores.contract += 15;
      }
      if (hasStrongLegalAnchor) {
        scores.contract += 15;
        // Only count weak legal terms if strong anchor present
        if (weakLegalTerms > 0) {
          scores.contract += weakLegalTerms * 2; // Reduced from 12pts each
        }
      }
      if (/indemnify|governing\s*law|severability|breach|remedies/i.test(text)) {
        scores.contract += 10;
      }

      // ─────────────────────────────────────────────────────────────
      // REPORT CLASSIFIER (FIXED)
      // ─────────────────────────────────────────────────────────────
      // Multiple section-type keywords needed; reduced intro score; section diversity bonus
      const reportSections = (lowerText.match(/abstract|introduction|methodology|results|conclusion|references|discussion|appendix/g) || []).length;
      const sectionDiversity = new Set(
        (lowerText.match(/abstract|introduction|methodology|results|conclusion|references|discussion/g) || [])
      ).size;
      
      if (/abstract|summary|overview/i.test(text)) {
        scores.report += 10;
      }
      if (/introduction|background|purpose/i.test(text)) {
        scores.report += 5; // Reduced from 12pts (was firing on cover letters)
      }
      if (/methodology|method|approach|procedure/i.test(text)) {
        scores.report += 10;
      }
      if (/results|findings|data\s*analysis|conclusion/i.test(text)) {
        scores.report += 12;
      }
      if (/references|bibliography|citations/i.test(text)) {
        scores.report += 8;
      }
      // Section diversity bonus (stacking reward)
      if (sectionDiversity >= 3) {
        scores.report += sectionDiversity * 3;
      } else if (reportSections === 0) {
        // No report sections found at all
        scores.report = Math.max(0, scores.report - 20);
      }
      // Long word counts alone don't score as report
      if (wordCount < 300) {
        scores.report -= 10;
      }

      // ─────────────────────────────────────────────────────────────
      // LETTER CLASSIFIER (FIXED)
      // ─────────────────────────────────────────────────────────────
      // Added modern closings; removed "thank you"; cut score 60% for long docs
      const modernClosings = /sincerely|regards|best\s*regards|kind\s*regards|warm\s*regards|with\s*appreciation|respectfully|yours\s*truly|cordially|best\s*wishes/i;
      const openings = /dear\s*\w+|to\s*whom|hello|hi\s*\w+/i;
      
      if (openings.test(text)) {
        scores.letter += 15;
      }
      if (modernClosings.test(text)) {
        scores.letter += 15;
      }
      if (/yours\s*truly|sincerely|regards/i.test(text)) {
        scores.letter += 10;
      }
      // Removed "thank you" firing (was hitting payment receipts)
      if (/i\s*hope|looking\s*forward|please\s*let\s*me|at\s*your\s*earliest/i.test(text)) {
        scores.letter += 5;
      }
      // Cut score 60% for documents over 2000 words (not typical letters)
      if (wordCount > 2000) {
        scores.letter *= 0.4;
      }

      // ─────────────────────────────────────────────────────────────
      // RESUME CLASSIFIER (FIXED)
      // ─────────────────────────────────────────────────────────────
      // Weak signals only count when strong anchors present
      const hasResumeAnchor = /resume|curriculum\s*vitae|cv|work\s*experience|technical\s*skills/i.test(text);
      const weakResumeTerms = (lowerText.match(/work|position|role|responsibility|project/g) || []).length;
      
      if (/resume|curriculum\s*vitae|cv\b/i.test(text)) {
        scores.resume += 25;
      }
      if (/work\s*experience|employment|professional\s*background/i.test(text)) {
        scores.resume += 15;
      }
      if (/education|degree|university|school|college/i.test(text)) {
        scores.resume += 10;
      }
      if (/skills?|competenc|expertise|technical|proficient/i.test(text)) {
        scores.resume += 10;
      }
      // Weak generic terms only count with strong anchor
      if (hasResumeAnchor && weakResumeTerms > 0) {
        scores.resume += weakResumeTerms * 1; // Reduced from 10pts each
      }
      if (/certif|license|award|achievement/i.test(text)) {
        scores.resume += 8;
      }

      // ─────────────────────────────────────────────────────────────
      // FORM CLASSIFIER (FIXED)
      // ─────────────────────────────────────────────────────────────
      // Removed figure count bonus; require true form marker first
      const hasFormMarkerStrong = /\[\s*\]|\[x\]|☐|☑|checkbox|signature\s*line|please\s*fill|print\s*name|date.*signature/i.test(text);
      
      if (hasFormMarkerStrong) {
        scores.form += 20;
      }
      if (/form|application|questionnaire|survey/i.test(text)) {
        scores.form += 15;
      }
      if (/field|blank|fill\s*in|required|optional|signature/i.test(text)) {
        scores.form += 12;
      }
      if (/please\s*provide|enter\s*your|name.*phone|address.*city/i.test(text)) {
        scores.form += 10;
      }
      // REMOVED: figureCount structural bonus (was firing on any scanned doc with images)
      // Form score is now based solely on true form markers

      // ─────────────────────────────────────────────────────────────
      // FLOWCHART CLASSIFIER (KEPT & STRENGTHENED)
      // ─────────────────────────────────────────────────────────────
      // Explicit shape regions required (not just any shape)
      const hasShapeIndicators = /diagram|flowchart|process\s*flow|decision|box|arrow|→|↓|▶|◆|step|stage/i.test(text);
      const shapeRegions = this.layout?.regions?.filter(r => r.type === 'shape') || [];
      
      if (/flowchart|diagram|process\s*flow/i.test(text)) {
        scores.flowchart += 20;
      }
      if (/decision|decision\s*point|\?|yes|no|if.*then/i.test(text)) {
        scores.flowchart += 10;
      }
      // Explicit shape regions (not heuristic alone)
      if (shapeRegions.length > 0) {
        scores.flowchart += shapeRegions.length * 5;
      }
      if (hasShapeIndicators && shapeRegions.length > 0) {
        scores.flowchart += 15; // Bonus for matching shapes + text
      }
      // Table + paragraphs alone is NOT a flowchart (fixes invoice false positive)
      if (shapeRegions.length === 0 && /table|cell|row|column/i.test(text)) {
        scores.flowchart = 0; // Clear flowchart score if no actual shapes
      }

      // ─────────────────────────────────────────────────────────────
      // NORMALIZE & RETURN
      // ─────────────────────────────────────────────────────────────
      // Ensure non-negative scores
      Object.keys(scores).forEach(key => {
        scores[key] = Math.max(0, scores[key]);
      });

      return scores;
    };

    console.log('✅ DOCUGRAPH classifier fix applied — document type detection corrected');
  }

  // Start waiting for analyzer
  waitForAnalyzer();
})();
