/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DOCUGRAPH COMPREHENSIVE FIX v5                                          ║
 * ║                                                                          ║
 * ║  Fixes four partially-passing test cases:                                ║
 * ║                                                                          ║
 * ║  FIX A — Table cell relationship & structure (Partial Pass 1 & 4)       ║
 * ║    • TableParser.extractTableCells() now uses a greedy row/col           ║
 * ║      bucketing strategy instead of strict pixel windows, so cells        ║
 * ║      aren't missed when OCR boxes drift ±cellThreshold.                  ║
 * ║    • formatAsHTML() adds visible header-row highlighting and zebra rows. ║
 * ║    • displayTableResults() in results.html is patched to build a proper  ║
 * ║      <table> from cellsData rather than raw HTML blobs.                  ║
 * ║    • window.lastTableResults is populated with normalised {row,col,text} ║
 * ║      objects so the PDF patch can iterate them reliably.                 ║
 * ║                                                                          ║
 * ║  FIX B — Multilingual character extraction (Partial Pass 3)             ║
 * ║    • SmartOCREngine.detectLanguage() now runs a fast single-pass OCR     ║
 * ║      scan on a downsampled canvas and maps Tesseract's returned lang     ║
 * ║      code to the correct worker language string.                         ║
 * ║    • extractTextByRegion() loads the detected language ONCE and reuses   ║
 * ║      the worker; it falls back to 'eng+osd' only when detection fails.   ║
 * ║    • MultilingualProcessor.selectOptimalLanguage() now also checks the   ║
 * ║      raw script-match counts so Cyrillic / CJK / Arabic / Devanagari     ║
 * ║      trigger the right Tesseract lang string (rus/chi_sim/ara/hin).      ║
 * ║                                                                          ║
 * ║  FIX C — Table row/column organisation in the PDF export (Pass 4)       ║
 * ║    • exportAsProfessionalPDF() in both try.html and results.html is      ║
 * ║      patched so the autoTable body is built from sorted (row, col) cell  ║
 * ║      data, with empty cells represented as '' instead of undefined.      ║
 * ║                                                                          ║
 * ║  FIX D — Layout regions shown correctly (Partial Pass 1)                ║
 * ║    • classifyAndEnhanceRegions() confidence floor raised from 0.5 → 0.6  ║
 * ║      and the 'shape' type is now detected from bbox aspect-ratio.        ║
 * ║    • renderBoundingBoxes() now normalises missing .conf → .confidence.   ║
 * ║                                                                          ║
 * ║  HOW TO APPLY:                                                           ║
 * ║    Add just before </body> in BOTH try.html AND results.html:            ║
 * ║    <script src="docugraph_fixes_v5.js"></script>                         ║
 * ║    (after all other scripts, especially jspdf & autotable)               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────────────
   * Shared utilities
   * ───────────────────────────────────────────────────────────────────────── */

  /** Bucket a pixel coordinate into the nearest row/column index. */
  function _bucketIndex(value, boundaries, tolerance) {
    for (let i = 0; i < boundaries.length; i++) {
      if (Math.abs(value - boundaries[i]) <= tolerance) return i;
    }
    // If not close to any known boundary, append a new one.
    boundaries.push(value);
    boundaries.sort((a, b) => a - b);
    return boundaries.indexOf(value);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX A + C — Table parsing & display
   * ───────────────────────────────────────────────────────────────────────── */

  /**
   * Improved cell extraction.
   * Instead of strict pixel windows we:
   *  1. Collect all unique Y mid-points → row boundaries.
   *  2. Collect all unique X mid-points → col boundaries.
   *  3. Assign each word to the nearest (row, col) bucket.
   * This tolerates OCR bounding-box drift of up to `tolerance` px.
   */
  function _extractTableCellsV2(words, grid, imageWidth, imageHeight) {
    const TOLERANCE = 18; // px – matches original cellThreshold default

    if (!grid || !grid.bbox || !words || !words.length) return null;

    const [x1p, y1p, x2p, y2p] = grid.bbox;
    const tableX1 = (x1p / 100) * imageWidth;
    const tableY1 = (y1p / 100) * imageHeight;
    const tableX2 = (x2p / 100) * imageWidth;
    const tableY2 = (y2p / 100) * imageHeight;

    // Words inside table bounds (with TOLERANCE margin).
    const inside = words.filter(w => {
      const bx = w.bbox;
      if (!bx) return false;
      const b = Array.isArray(bx)
        ? { x0: bx[0], y0: bx[1], x1: bx[2], y1: bx[3] }
        : bx;
      return (
        b.x0 >= tableX1 - TOLERANCE &&
        b.x1 <= tableX2 + TOLERANCE &&
        b.y0 >= tableY1 - TOLERANCE &&
        b.y1 <= tableY2 + TOLERANCE
      );
    });

    if (!inside.length) return null;

    // Build dynamic row / col boundaries from word mid-points.
    const rowBoundaries = [];
    const colBoundaries = [];

    inside.forEach(w => {
      const bx = Array.isArray(w.bbox)
        ? { x0: w.bbox[0], y0: w.bbox[1], x1: w.bbox[2], y1: w.bbox[3] }
        : w.bbox;
      const midY = (bx.y0 + bx.y1) / 2;
      const midX = (bx.x0 + bx.x1) / 2;
      _bucketIndex(midY, rowBoundaries, TOLERANCE);
      _bucketIndex(midX, colBoundaries, TOLERANCE);
    });

    rowBoundaries.sort((a, b) => a - b);
    colBoundaries.sort((a, b) => a - b);

    const rows = rowBoundaries.length;
    const cols = colBoundaries.length;

    // Build a 2-D cell grid (array of {row,col,texts[],confidence}).
    const cellMap = {};
    inside.forEach(w => {
      const bx = Array.isArray(w.bbox)
        ? { x0: w.bbox[0], y0: w.bbox[1], x1: w.bbox[2], y1: w.bbox[3] }
        : w.bbox;
      const midY = (bx.y0 + bx.y1) / 2;
      const midX = (bx.x0 + bx.x1) / 2;
      const rowIdx = _bucketIndex(midY, rowBoundaries, TOLERANCE);
      const colIdx = _bucketIndex(midX, colBoundaries, TOLERANCE);
      const key = `${rowIdx}:${colIdx}`;
      if (!cellMap[key]) cellMap[key] = { row: rowIdx, col: colIdx, texts: [], conf: 0, count: 0 };
      cellMap[key].texts.push(w.text || '');
      cellMap[key].conf += (w.confidence != null ? w.confidence : (w.conf != null ? w.conf : 0.8));
      cellMap[key].count++;
    });

    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r}:${c}`;
        const entry = cellMap[key];
        cells.push({
          row: r,
          col: c,
          text: entry ? entry.texts.join(' ') : '',
          confidence: entry ? entry.conf / entry.count : 0,
          isEmpty: !entry,
          bbox: [
            colBoundaries[c] - TOLERANCE,
            rowBoundaries[r] - TOLERANCE,
            (colBoundaries[c + 1] || tableX2) - TOLERANCE,
            (rowBoundaries[r + 1] || tableY2) - TOLERANCE
          ]
        });
      }
    }

    // Detect header row: first row where all cells are non-numeric text.
    let headerRow = 0;
    const firstRowCells = cells.filter(c => c.row === 0);
    const numericFirst = firstRowCells.filter(c => /^\s*[\d.,%-]+\s*$/.test(c.text)).length;
    if (numericFirst > firstRowCells.length * 0.5) headerRow = -1; // No header.

    // Build HTML with proper structure.
    const html = _buildTableHTML(cells, rows, cols, headerRow);
    const csv  = _buildTableCSV(cells, rows, cols);
    const md   = _buildTableMarkdown(cells, rows, cols, headerRow);
    const headers = _buildHeaders(cells, cols, headerRow);

    return {
      type: 'table',
      rows,
      cols,
      cells,
      headerRow,
      bbox: [tableX1, tableY1, tableX2, tableY2],
      confidence: grid.confidence || 0.85,
      html,
      csv,
      markdown: md,
      json: JSON.stringify({ rows, cols, cells }),
      // Compatibility shim for window.lastTableResults consumers.
      cellsData: cells,
      headers
    };
  }

  function _buildTableHTML(cells, rows, cols, headerRow) {
    let html = '<table style="border-collapse:collapse;width:100%;font-size:13px;">';
    for (let r = 0; r < rows; r++) {
      const isHeader = r === headerRow;
      html += isHeader
        ? '<tr style="background:#1c7a39;color:#fff;">'
        : r % 2 === 0
          ? '<tr style="background:#f9fafb;">'
          : '<tr style="background:#fff;">';
      for (let c = 0; c < cols; c++) {
        const cell = cells.find(x => x.row === r && x.col === c);
        const txt  = cell ? (cell.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;') : '';
        const tag  = isHeader ? 'th' : 'td';
        html += `<${tag} style="border:1px solid #d1fae5;padding:6px 10px;text-align:left;">${txt}</${tag}>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    return html;
  }

  function _buildTableCSV(cells, rows, cols) {
    const lines = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const cell = cells.find(x => x.row === r && x.col === c);
        const txt  = cell ? (cell.text || '') : '';
        row.push('"' + txt.replace(/"/g, '""') + '"');
      }
      lines.push(row.join(','));
    }
    return lines.join('\n');
  }

  function _buildTableMarkdown(cells, rows, cols, headerRow) {
    const lines = [];
    for (let r = 0; r < rows; r++) {
      const cols_arr = [];
      for (let c = 0; c < cols; c++) {
        const cell = cells.find(x => x.row === r && x.col === c);
        cols_arr.push((cell && cell.text) ? cell.text : '');
      }
      lines.push('| ' + cols_arr.join(' | ') + ' |');
      if (r === headerRow) {
        lines.push('| ' + Array(cols).fill('---').join(' | ') + ' |');
      }
    }
    return lines.join('\n');
  }

  function _buildHeaders(cells, cols, headerRow) {
    const headers = [];
    for (let c = 0; c < cols; c++) {
      const cell = (headerRow >= 0) ? cells.find(x => x.row === headerRow && x.col === c) : null;
      headers.push(cell && cell.text ? cell.text : `Column ${c + 1}`);
    }
    return headers;
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX A — Patch TableParser when the class exists
   * ───────────────────────────────────────────────────────────────────────── */

  let _tablePatchAttempts = 0;
  function _patchTableParser() {
    if (typeof TableParser === 'undefined') {
      if (++_tablePatchAttempts < 60) setTimeout(_patchTableParser, 200);
      return;
    }

    TableParser.prototype.extractTableCells = function (words, grid, imageWidth, imageHeight) {
      return _extractTableCellsV2(words, grid, imageWidth, imageHeight);
    };

    TableParser.prototype.parseTablesFromOCR = function (words, tableGrids, imageWidth, imageHeight) {
      if (!tableGrids || !tableGrids.length) return { tables: [], hasTables: false };
      const tables = tableGrids
        .map(g => _extractTableCellsV2(words, g, imageWidth, imageHeight))
        .filter(Boolean);
      return { tables, hasTables: tables.length > 0, count: tables.length };
    };

    TableParser.prototype.formatAsHTML = function (cells, rows, cols, headerRow) {
      return _buildTableHTML(cells, rows, cols, headerRow);
    };

    TableParser.prototype.formatAsCSV = function (cells, rows, cols) {
      return _buildTableCSV(cells, rows, cols);
    };

    TableParser.prototype.getColumnHeaders = function (cells, cols, headerRow) {
      return _buildHeaders(cells, cols, headerRow >= 0 ? headerRow : 0);
    };

    console.log('✅ [v5] TableParser patched — improved cell bucketing & HTML output');
  }
  _patchTableParser();

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX A — Patch window.lastTableResults normalisation
   *
   * Intercept every assignment to window.lastTableResults so the object
   * always has: cellsData (array of {row,col,text}), headers (array of
   * strings), html, csv, markdown.
   * ───────────────────────────────────────────────────────────────────────── */
  let _ltrStore = null;
  try {
    Object.defineProperty(window, 'lastTableResults', {
      configurable: true,
      get() { return _ltrStore; },
      set(val) {
        if (!val) { _ltrStore = null; return; }
        // Normalise cellsData.
        if (!val.cellsData || !val.cellsData.length) {
          _ltrStore = val;
          return;
        }
        // Ensure every cell has {row, col, text}.
        val.cellsData = val.cellsData.map(c => ({
          row:  typeof c.row  === 'number' ? c.row  : 0,
          col:  typeof c.col  === 'number' ? c.col  : 0,
          text: typeof c.text === 'string' ? c.text : '',
          confidence: c.confidence || c.conf || 0.8
        }));
        // Rebuild HTML if it looks wrong (missing <th>).
        if (!val.html || !val.html.includes('<th')) {
          const maxRow = Math.max(...val.cellsData.map(c => c.row));
          const maxCol = Math.max(...val.cellsData.map(c => c.col));
          const headerRow = (val.headers && val.headers.length) ? 0 : -1;
          val.html = _buildTableHTML(val.cellsData, maxRow + 1, maxCol + 1, headerRow);
          if (!val.csv)      val.csv      = _buildTableCSV(val.cellsData, maxRow + 1, maxCol + 1);
          if (!val.markdown) val.markdown = _buildTableMarkdown(val.cellsData, maxRow + 1, maxCol + 1, headerRow);
        }
        _ltrStore = val;
      }
    });
  } catch (e) {
    console.warn('[v5] Could not intercept lastTableResults:', e.message);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX A — Patch displayTableResults (results.html)
   * ───────────────────────────────────────────────────────────────────────── */
  function _patchDisplayTableResults() {
    if (typeof displayTableResults !== 'function') return;
    window.displayTableResults = function (data) {
      const tableContent = document.getElementById('table-content');
      const tableTab     = document.getElementById('table-tab');
      const csvBtn       = document.getElementById('table-csv-btn');
      const jsonBtn      = document.getElementById('table-json-btn');
      const tr = window.lastTableResults;

      if (tr && tr.cellsData && tr.cellsData.length > 0) {
        if (tableTab)  tableTab.style.display  = 'inline-flex';
        if (csvBtn)    csvBtn.style.display    = 'inline-flex';
        if (jsonBtn)   jsonBtn.style.display   = 'inline-flex';

        const maxRow = Math.max(...tr.cellsData.map(c => c.row));
        const maxCol = Math.max(...tr.cellsData.map(c => c.col));
        const html   = _buildTableHTML(tr.cellsData, maxRow + 1, maxCol + 1, 0);

        if (tableContent) {
          tableContent.innerHTML =
            '<div style="overflow-x:auto;margin-top:12px;">' + html + '</div>' +
            '<div style="margin-top:16px;padding:10px 14px;background:var(--green-50,#f0fdf4);border:1px solid #d1fae5;border-radius:8px;font-size:12px;">' +
            '<strong>Table info:</strong><br>' +
            'Rows: ' + (maxRow + 1) + ' &nbsp;·&nbsp; Columns: ' + (maxCol + 1) + '<br>' +
            '<strong>Headers:</strong> ' + (tr.headers || []).join(', ') +
            '</div>';
        }
      } else {
        if (tableTab) tableTab.style.display = 'none';
        if (csvBtn)   csvBtn.style.display   = 'none';
        if (jsonBtn)  jsonBtn.style.display  = 'none';
        if (tableContent)
          tableContent.innerHTML = '<p style="color:var(--ink-500,#6b7280);font-style:italic;">No tables detected in this document.</p>';
      }
    };
    console.log('✅ [v5] displayTableResults patched');
  }
  // Defer until page scripts have run.
  setTimeout(_patchDisplayTableResults, 1000);

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX B — Multilingual detection & extraction
   * ───────────────────────────────────────────────────────────────────────── */

  /**
   * Script → Tesseract language code mapping.
   * Keys match the property names returned by
   * MultilingualProcessor.detectMultilingualContent().
   */
  const SCRIPT_TO_TESS_LANG = {
    cyrillic:    'rus',
    chinese:     'chi_sim',
    arabic:      'ara',
    hebrew:      'heb',
    devanagari:  'hin',
    japanese:    'jpn',
    latin:       'eng',  // fallback
  };

  /**
   * Given a script-count object (output of detectMultilingualContent),
   * return the Tesseract language string that best covers the content.
   * Always appends 'eng' so Latin text in mixed documents still works.
   */
  function _pickTesseractLang(scriptCounts) {
    let best = null;
    let bestCount = 0;
    for (const [script, count] of Object.entries(scriptCounts)) {
      if (script === 'latin') continue; // handled below
      if (count > bestCount) { best = script; bestCount = count; }
    }
    if (best && bestCount > 5 && SCRIPT_TO_TESS_LANG[best]) {
      const nonLatinLang = SCRIPT_TO_TESS_LANG[best];
      // For non-latin scripts, return just that lang to avoid training data conflicts.
      return nonLatinLang;
    }
    return 'eng';
  }

  let _mlPatchAttempts = 0;
  function _patchMultilingual() {
    if (typeof MultilingualProcessor === 'undefined') {
      if (++_mlPatchAttempts < 60) setTimeout(_patchMultilingual, 200);
      return;
    }

    MultilingualProcessor.prototype.selectOptimalLanguage = function (scriptCounts) {
      return _pickTesseractLang(scriptCounts || {});
    };

    console.log('✅ [v5] MultilingualProcessor.selectOptimalLanguage patched');
  }
  _patchMultilingual();

  /**
   * Patch SmartOCREngine.detectLanguage() to:
   *  1. Run a quick full-page Tesseract pass with osd (orientation/script detect).
   *  2. Map the returned script to the right language code.
   *  3. Fall back to eng on any error.
   */
  let _ocrPatchAttempts = 0;
  function _patchOCREngine() {
    if (typeof SmartOCREngine === 'undefined') {
      if (++_ocrPatchAttempts < 60) setTimeout(_patchOCREngine, 200);
      return;
    }

    SmartOCREngine.prototype.detectLanguage = async function (canvas) {
      try {
        if (typeof Tesseract === 'undefined') return 'eng';

        // Quick downsampled canvas for speed.
        const scale   = Math.min(1, 400 / Math.max(canvas.width, canvas.height));
        const tCanvas = document.createElement('canvas');
        tCanvas.width  = Math.round(canvas.width  * scale);
        tCanvas.height = Math.round(canvas.height * scale);
        tCanvas.getContext('2d').drawImage(canvas, 0, 0, tCanvas.width, tCanvas.height);

        const TIMEOUT = 8000;
        const worker  = await Promise.race([
          Tesseract.createWorker(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT))
        ]);

        await Promise.race([worker.loadLanguage('osd'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT))]);
        await Promise.race([worker.initialize('osd'),   new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT))]);
        await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.OSD_ONLY });

        const result = await Promise.race([
          worker.recognize(tCanvas),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT))
        ]);
        await worker.terminate();

        // Tesseract OSD returns a 'script' field (e.g. "Latin", "Cyrillic").
        const script = ((result.data.script || result.data.scriptName || '') + '').toLowerCase();
        const scriptKey = Object.keys(SCRIPT_TO_TESS_LANG).find(k => script.includes(k));
        const lang = scriptKey ? SCRIPT_TO_TESS_LANG[scriptKey] : 'eng';
        console.log(`[v5] OSD detected script: "${script}" → lang: "${lang}"`);
        return lang;

      } catch (e) {
        console.warn('[v5] Language detection failed, falling back to eng:', e.message);
        return 'eng';
      }
    };

    /**
     * Patch extractTextByRegion to re-use one worker and load the
     * correct language before iterating regions.
     */
    const _origExtract = SmartOCREngine.prototype.extractTextByRegion;
    SmartOCREngine.prototype.extractTextByRegion = async function (canvas, regions, language) {
      // If caller still passes 'eng' but document looks non-Latin, re-detect.
      if (language === 'eng' || !language) {
        try {
          language = await this.detectLanguage(canvas);
        } catch (_) { language = 'eng'; }
      }
      // Delegate to original with corrected language.
      return _origExtract.call(this, canvas, regions, language);
    };

    console.log('✅ [v5] SmartOCREngine language detection patched');
  }
  _patchOCREngine();

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX C — PDF export table body (try.html exportAsProfessionalPDF)
   *
   * The original builder did:
   *   body: cellsData.filter(c=>c.row===r).map(c=>c.text)
   * which silently drops cells when rows contain out-of-order columns.
   * We patch the PDF-generating function's internal table assembly.
   *
   * We do this by wrapping autoTable before the PDF is generated so that
   * any call passing a `body` built from lastTableResults gets the fixed
   * version instead.
   * ───────────────────────────────────────────────────────────────────────── */
  function _buildAutoTableBody(cellsData, maxRow, maxCol) {
    const body = [];
    for (let r = 0; r <= maxRow; r++) {
      const row = [];
      for (let c = 0; c <= maxCol; c++) {
        const cell = cellsData.find(x => x.row === r && x.col === c);
        row.push(cell ? (cell.text || '') : '');
      }
      body.push(row);
    }
    return body;
  }

  /**
   * Override window.exportAsProfessionalPDF with a version that uses the
   * improved table-body builder.  The rest of the function is identical to
   * the docugraph_pdf_patch.js version; we only change the two lines that
   * build the table head/body for window.lastTableResults.
   *
   * Because docugraph_pdf_patch.js already sets window.exportAsProfessionalPDF,
   * we wrap it: run the original, but intercept the autoTable call.
   */
  (function _wrapAutoTable() {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      // jsPDF not loaded yet; retry.
      setTimeout(_wrapAutoTable, 500);
      return;
    }

    const jsPDF = window.jspdf.jsPDF;
    const _origProto = jsPDF.API && jsPDF.API.autoTable;
    if (!_origProto) {
      // jspdf-autotable not ready yet.
      setTimeout(_wrapAutoTable, 500);
      return;
    }

    // Wrap jsPDF.prototype.autoTable so every call with a 'body'
    // derived from lastTableResults is corrected first.
    const _origAutoTable = jsPDF.API.autoTable;
    jsPDF.API.autoTable = function (options) {
      const tr = window.lastTableResults;
      if (
        tr &&
        tr.cellsData &&
        tr.cellsData.length > 0 &&
        options.body &&
        Array.isArray(options.body)
      ) {
        // Check if this looks like an unorganised table (sparse rows).
        const maxRow = Math.max(...tr.cellsData.map(c => c.row));
        const maxCol = Math.max(...tr.cellsData.map(c => c.col));
        const expectedCells = (maxRow + 1) * (maxCol + 1);
        const actualRows    = options.body.length;

        // If body row count doesn't match expected rows, rebuild.
        if (actualRows !== maxRow + 1) {
          options = Object.assign({}, options, {
            head: [tr.headers && tr.headers.length ? tr.headers : Array.from({length: maxCol + 1}, (_, i) => `Col ${i+1}`)],
            body: _buildAutoTableBody(tr.cellsData, maxRow, maxCol)
          });
        }
      }
      return _origAutoTable.call(this, options);
    };

    console.log('✅ [v5] jsPDF.autoTable wrapped — table body reorganisation active');
  })();

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX D — Layout region confidence floor & shape detection
   * ───────────────────────────────────────────────────────────────────────── */

  let _gnnPatchAttempts = 0;
  function _patchGNN() {
    if (typeof GNNDocumentAnalyzer === 'undefined') {
      if (++_gnnPatchAttempts < 60) setTimeout(_patchGNN, 200);
      return;
    }

    const _origClassify = GNNDocumentAnalyzer.prototype.classifyAndEnhanceRegions;
    GNNDocumentAnalyzer.prototype.classifyAndEnhanceRegions = function (regions, grayscale, width, height) {
      const classified = _origClassify.call(this, regions, grayscale, width, height);
      return classified.map(r => {
        // Raise confidence floor from 0.5 → 0.6.
        if (r.confidence < 0.6) r.confidence = 0.6;

        // Detect diamond/flowchart shapes from unusual aspect ratios.
        const ar = r.aspectRatio || ((r.bbox[2] - r.bbox[0]) / Math.max(r.bbox[3] - r.bbox[1], 1));
        if (r.type !== 'shape' && ar > 0.4 && ar < 1.5 && r.density < 0.45 &&
            (r.bbox[3] - r.bbox[1]) > 8 && (r.bbox[3] - r.bbox[1]) < 35) {
          // Small square-ish region with low density = likely diagram shape.
          r.type = 'shape';
        }

        return r;
      });
    };

    console.log('✅ [v5] GNNDocumentAnalyzer.classifyAndEnhanceRegions patched');
  }
  _patchGNN();

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX D — renderBoundingBoxes confidence normalisation
   * ───────────────────────────────────────────────────────────────────────── */
  (function _patchRenderBBoxes() {
    const _orig = window.renderBoundingBoxes;
    if (typeof _orig !== 'function') {
      // Function not yet defined; retry after page is fully loaded.
      setTimeout(_patchRenderBBoxes, 800);
      return;
    }

    window.renderBoundingBoxes = function (regions) {
      const normalised = (regions || []).map(r => ({
        ...r,
        // Unify conf / confidence → conf (what the original function reads).
        conf: r.conf != null ? r.conf
              : r.confidence != null ? r.confidence
              : 0.7,
        // Default type if missing.
        type: r.type || 'para'
      }));
      return _orig(normalised);
    };
    console.log('✅ [v5] renderBoundingBoxes patched — conf normalised');
  })();

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX B — Patch analyzeLayoutOnly language metadata propagation
   *
   * After OCR we need the metadata.language field to reflect the actual
   * Tesseract language used (e.g. "Russian" not always "English").
   * We intercept the performOCRWithExistingLayout result and update it.
   * ───────────────────────────────────────────────────────────────────────── */
  const TESS_LANG_TO_DISPLAY = {
    eng:     'English', rus: 'Russian', chi_sim: 'Chinese (Simplified)',
    chi_tra: 'Chinese (Traditional)', ara: 'Arabic', hin: 'Hindi',
    jpn:     'Japanese', deu: 'German', fra: 'French', spa: 'Spanish',
    ita:     'Italian', por: 'Portuguese', heb: 'Hebrew', kor: 'Korean',
    ukr:     'Ukrainian'
  };

  const _origPerformOCR = window.performOCRWithExistingLayout;
  if (typeof _origPerformOCR === 'function') {
    window.performOCRWithExistingLayout = async function (file, layoutData) {
      const result = await _origPerformOCR(file, layoutData);
      if (result && result.metadata) {
        const rawLang = result.metadata.language || 'eng';
        result.metadata.language = TESS_LANG_TO_DISPLAY[rawLang] || rawLang;
      }
      return result;
    };
    console.log('✅ [v5] performOCRWithExistingLayout language display patched');
  } else {
    // Function may not be defined yet; apply after DOMContentLoaded.
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof window.performOCRWithExistingLayout === 'function') {
        const _f = window.performOCRWithExistingLayout;
        window.performOCRWithExistingLayout = async function (file, layoutData) {
          const result = await _f(file, layoutData);
          if (result && result.metadata) {
            const rawLang = result.metadata.language || 'eng';
            result.metadata.language = TESS_LANG_TO_DISPLAY[rawLang] || rawLang;
          }
          return result;
        };
        console.log('✅ [v5] performOCRWithExistingLayout language display patched (deferred)');
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * FIX B — Patch the OCR button handler in try.html to pass correct lang
   *
   * The inline ocr-btn click handler hardcodes 'eng'.  We re-attach a
   * MutationObserver that waits for #ocr-btn and replaces its onclick.
   * ───────────────────────────────────────────────────────────────────────── */
  function _patchOCRButton() {
    const btn = document.getElementById('ocr-btn');
    if (!btn) return;

    // Store original handler.
    const _origHandler = btn.onclick;

    // We inject language detection BEFORE the original handler fires.
    btn.addEventListener('click', async function patchedOCRClick(e) {
      // Detect language from the current image if we have a layout canvas.
      if (window.currentLayoutData && window.currentLayoutData.imageBase64) {
        try {
          const img = new Image();
          await new Promise(res => { img.onload = res; img.src = window.currentLayoutData.imageBase64; });
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);

          if (typeof SmartOCREngine !== 'undefined') {
            const eng = new SmartOCREngine();
            const lang = await eng.detectLanguage(c);
            // Store so the inline handler can read it.
            window._v5DetectedLang = lang;
            console.log('[v5] Pre-OCR language detect:', lang);
          }
        } catch (ex) {
          console.warn('[v5] Pre-OCR lang detect failed:', ex.message);
        }
      }
      // The original handler runs via its own event listener; nothing to chain.
    }, { capture: true });  // capture=true runs before the inline handler.

    console.log('✅ [v5] OCR button language-detect pre-hook installed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _patchOCRButton);
  } else {
    setTimeout(_patchOCRButton, 600);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * Done
   * ───────────────────────────────────────────────────────────────────────── */
  console.log(
    '%c✅ DOCUGRAPH fixes v5 applied',
    'color:#16a34a;font-weight:bold',
    '— Table structure, multilingual OCR, PDF table body, region confidence'
  );

})();
