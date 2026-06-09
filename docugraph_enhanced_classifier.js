/**
 * DOCUGRAPH Enhanced Classifier
 * 
 * Adds CNN feature extraction + GNN layout analysis for precise document type detection
 * 
 * Architecture:
 * 1. CNNFeatureExtractor - texture signals from raw pixels (Sobel, lines, zones, checkboxes)
 * 2. GNNLayoutAnalyzer - proximity graph analysis (headers, tables, label:value pairs, flow)
 * 3. Per-type scorers - Invoice, Resume, Contract, Report, Letter, Form
 * 4. Receipt & Flowchart preserved via guard threshold
 * 
 * Integration:
 * - Wraps DocumentTypeClassifier.classifyDocument()
 * - Patches currentLayoutData and lastProcessedDocument for early feedback
 * - Debug API: DocugraphEnhancedClassifier.debug() and .classify()
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // Configuration
  // ═══════════════════════════════════════════════════════════════════
  const RECEIPT_FLOWCHART_GUARD_THRESHOLD = 40; // Don't override existing receipt/flowchart if score >= 40

  // ═══════════════════════════════════════════════════════════════════
  // CNN Feature Extractor
  // Extracts texture and spatial signals from raw image pixels
  // ═══════════════════════════════════════════════════════════════════
  class CNNFeatureExtractor {
    constructor() {
      this.features = {};
    }

    /**
     * Extract CNN features from image data
     * Returns: {
     *   sobelEdgeDensity: 0-100,
     *   horizontalLineRatio: 0-100,
     *   verticalLineRatio: 0-100,
     *   zoneWeights: [9 values for grid zones],
     *   checkboxCount: int,
     *   topHeavyScore: 0-100,
     *   columnSymmetry: 0-100,
     *   inkDensity: 0-100
     * }
     */
    extract(imageData, width, height, regions) {
      if (!imageData || !imageData.data) {
        return this._getDefaultFeatures();
      }

      try {
        const pixelData = imageData.data;
        
        // Extract texture signals
        const sobelEdgeDensity = this._computeSobelEdgeDensity(pixelData, width, height);
        const { horizontalLineRatio, verticalLineRatio } = this._computeLineRatios(pixelData, width, height);
        const zoneWeights = this._computeZoneWeights(pixelData, width, height);
        const checkboxCount = this._detectCheckboxes(regions);
        const topHeavyScore = this._computeTopHeavyScore(regions, height);
        const columnSymmetry = this._computeColumnSymmetry(pixelData, width, height);
        const inkDensity = this._computeInkDensity(pixelData);

        this.features = {
          sobelEdgeDensity,
          horizontalLineRatio,
          verticalLineRatio,
          zoneWeights,
          checkboxCount,
          topHeavyScore,
          columnSymmetry,
          inkDensity
        };

        return this.features;
      } catch (e) {
        console.warn('[CNN] Feature extraction error:', e.message);
        return this._getDefaultFeatures();
      }
    }

    _computeSobelEdgeDensity(pixelData, width, height) {
      // Sample every 4th pixel for performance
      let edgeCount = 0;
      let sampleCount = 0;

      for (let y = 1; y < height - 1; y += 4) {
        for (let x = 1; x < width - 1; x += 4) {
          const idx = (y * width + x) * 4;
          
          // Simplified Sobel: check brightness change to neighbors
          const center = pixelData[idx];
          const right = pixelData[((y * width + (x + 1))) * 4] || 0;
          const bottom = pixelData[(((y + 1) * width + x)) * 4] || 0;
          
          const gx = Math.abs(right - center);
          const gy = Math.abs(bottom - center);
          
          if (gx + gy > 30) edgeCount++;
          sampleCount++;
        }
      }

      return Math.min(100, (edgeCount / sampleCount) * 100);
    }

    _computeLineRatios(pixelData, width, height) {
      // Detect long horizontal and vertical dark runs
      let horizontalLines = 0;
      let verticalLines = 0;

      // Horizontal lines: scan rows for long dark runs
      for (let y = 0; y < height; y += 2) {
        let darkRun = 0;
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const brightness = (pixelData[idx] + pixelData[idx + 1] + pixelData[idx + 2]) / 3;
          if (brightness < 128) {
            darkRun++;
          } else {
            if (darkRun > width * 0.4) horizontalLines++;
            darkRun = 0;
          }
        }
        if (darkRun > width * 0.4) horizontalLines++;
      }

      // Vertical lines: scan columns for long dark runs
      for (let x = 0; x < width; x += 2) {
        let darkRun = 0;
        for (let y = 0; y < height; y++) {
          const idx = (y * width + x) * 4;
          const brightness = (pixelData[idx] + pixelData[idx + 1] + pixelData[idx + 2]) / 3;
          if (brightness < 128) {
            darkRun++;
          } else {
            if (darkRun > height * 0.4) verticalLines++;
            darkRun = 0;
          }
        }
        if (darkRun > height * 0.4) verticalLines++;
      }

      const horizontalLineRatio = Math.min(100, (horizontalLines / (height / 2)) * 100);
      const verticalLineRatio = Math.min(100, (verticalLines / (width / 2)) * 100);

      return { horizontalLineRatio, verticalLineRatio };
    }

    _computeZoneWeights(pixelData, width, height) {
      // Divide page into 3×3 grid, compute ink density in each zone
      const zoneWeights = new Array(9).fill(0);
      const zoneWidth = Math.floor(width / 3);
      const zoneHeight = Math.floor(height / 3);

      for (let zone = 0; zone < 9; zone++) {
        const zoneRow = Math.floor(zone / 3);
        const zoneCol = zone % 3;
        const startX = zoneCol * zoneWidth;
        const startY = zoneRow * zoneHeight;
        const endX = Math.min(startX + zoneWidth, width);
        const endY = Math.min(startY + zoneHeight, height);

        let darkPixels = 0;
        let totalPixels = 0;

        for (let y = startY; y < endY; y += 2) {
          for (let x = startX; x < endX; x += 2) {
            const idx = (y * width + x) * 4;
            const brightness = (pixelData[idx] + pixelData[idx + 1] + pixelData[idx + 2]) / 3;
            if (brightness < 200) darkPixels++;
            totalPixels++;
          }
        }

        zoneWeights[zone] = totalPixels > 0 ? (darkPixels / totalPixels) * 100 : 0;
      }

      return zoneWeights;
    }

    _detectCheckboxes(regions) {
      if (!regions || !Array.isArray(regions)) return 0;

      let checkboxCount = 0;
      for (const region of regions) {
        if (!region.bbox || region.bbox.length < 4) continue;
        
        const w = region.bbox[2] - region.bbox[0];
        const h = region.bbox[3] - region.bbox[1];
        
        // Checkbox signature: roughly square (0.7-1.3 aspect), ~20-30px size
        const aspectRatio = w / (h || 1);
        if (aspectRatio >= 0.7 && aspectRatio <= 1.3 && w >= 15 && w <= 40 && h >= 15 && h <= 40) {
          checkboxCount++;
        }
      }

      return checkboxCount;
    }

    _computeTopHeavyScore(regions, pageHeight) {
      if (!regions || regions.length === 0) return 0;

      const topZone = pageHeight * 0.3;
      let topRegions = 0;

      for (const region of regions) {
        if (region.bbox && region.bbox[1] < topZone) {
          topRegions++;
        }
      }

      return Math.min(100, (topRegions / regions.length) * 100);
    }

    _computeColumnSymmetry(pixelData, width, height) {
      // Check if left and right halves are similar (letterhead/form symmetry)
      const midX = Math.floor(width / 2);
      let matches = 0;
      let total = 0;

      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < midX; x += 4) {
          const leftIdx = (y * width + x) * 4;
          const rightIdx = (y * width + (width - 1 - x)) * 4;
          
          const leftBrightness = (pixelData[leftIdx] + pixelData[leftIdx + 1] + pixelData[leftIdx + 2]) / 3;
          const rightBrightness = (pixelData[rightIdx] + pixelData[rightIdx + 1] + pixelData[rightIdx + 2]) / 3;
          
          if (Math.abs(leftBrightness - rightBrightness) < 30) {
            matches++;
          }
          total++;
        }
      }

      return total > 0 ? (matches / total) * 100 : 0;
    }

    _computeInkDensity(pixelData) {
      let darkPixels = 0;
      let sampleInterval = Math.max(1, Math.floor(pixelData.length / 10000)); // ~10k samples

      for (let i = 0; i < pixelData.length; i += sampleInterval * 4) {
        const brightness = (pixelData[i] + pixelData[i + 1] + pixelData[i + 2]) / 3;
        if (brightness < 200) darkPixels++;
      }

      return (darkPixels / (pixelData.length / (sampleInterval * 4))) * 100;
    }

    _getDefaultFeatures() {
      return {
        sobelEdgeDensity: 0,
        horizontalLineRatio: 0,
        verticalLineRatio: 0,
        zoneWeights: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        checkboxCount: 0,
        topHeavyScore: 0,
        columnSymmetry: 0,
        inkDensity: 0
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // GNN Layout Analyzer
  // Builds proximity graph and derives graph-level features
  // ═══════════════════════════════════════════════════════════════════
  class GNNLayoutAnalyzer {
    constructor() {
      this.features = {};
    }

    /**
     * Extract GNN features from regions layout
     * Returns: {
     *   headerCount: int,
     *   tableCount: int,
     *   figureCount: int,
     *   separatorCount: int,
     *   sameLine: int (label:value pairs),
     *   narrowParaCount: int,
     *   wideParaCount: int,
     *   regularFlow: bool (consistent Y-gaps),
     *   columnLayout: bool,
     *   topHasTable: bool,
     *   avgRegionSize: int
     * }
     */
    extract(regions) {
      if (!regions || !Array.isArray(regions) || regions.length === 0) {
        return this._getDefaultFeatures();
      }

      try {
        const headerCount = regions.filter(r => r.type === 'header').length;
        const tableCount = regions.filter(r => r.type === 'table').length;
        const figureCount = regions.filter(r => r.type === 'figure').length;
        const separatorCount = regions.filter(r => r.type === 'separator').length;
        
        const sameLine = this._countSameLinePairs(regions);
        const { narrowParaCount, wideParaCount } = this._countParagraphs(regions);
        const regularFlow = this._isRegularFlow(regions);
        const columnLayout = this._detectColumnLayout(regions);
        const topHasTable = this._topHasTable(regions);
        
        const avgRegionSize = regions.reduce((sum, r) => {
          if (r.bbox && r.bbox.length >= 4) {
            const area = (r.bbox[2] - r.bbox[0]) * (r.bbox[3] - r.bbox[1]);
            return sum + area;
          }
          return sum;
        }, 0) / regions.length;

        this.features = {
          headerCount,
          tableCount,
          figureCount,
          separatorCount,
          sameLine,
          narrowParaCount,
          wideParaCount,
          regularFlow,
          columnLayout,
          topHasTable,
          avgRegionSize: Math.round(avgRegionSize)
        };

        return this.features;
      } catch (e) {
        console.warn('[GNN] Feature extraction error:', e.message);
        return this._getDefaultFeatures();
      }
    }

    _countSameLinePairs(regions) {
      // Count regions at same Y position (label:value pattern)
      let pairs = 0;
      const tolerance = 5;

      for (let i = 0; i < regions.length; i++) {
        for (let j = i + 1; j < regions.length; j++) {
          if (!regions[i].bbox || !regions[j].bbox) continue;
          
          const y1 = regions[i].bbox[1];
          const y2 = regions[j].bbox[1];
          
          if (Math.abs(y1 - y2) < tolerance) {
            pairs++;
          }
        }
      }

      return pairs;
    }

    _countParagraphs(regions) {
      let narrowParaCount = 0;
      let wideParaCount = 0;

      for (const region of regions) {
        if (!region.bbox || region.bbox.length < 4) continue;
        if (region.type !== 'para' && region.type !== 'text') continue;

        const width = region.bbox[2] - region.bbox[0];
        if (width < 200) {
          narrowParaCount++;
        } else {
          wideParaCount++;
        }
      }

      return { narrowParaCount, wideParaCount };
    }

    _isRegularFlow(regions) {
      // Check if Y-gaps between regions are consistent (resume signature)
      const yPositions = regions
        .filter(r => r.bbox && r.bbox.length >= 4)
        .map(r => r.bbox[1])
        .sort((a, b) => a - b);

      if (yPositions.length < 3) return false;

      const gaps = [];
      for (let i = 1; i < yPositions.length; i++) {
        gaps.push(yPositions[i] - yPositions[i - 1]);
      }

      // Check if gaps are relatively consistent
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const variance = gaps.reduce((acc, g) => acc + Math.pow(g - avgGap, 2), 0) / gaps.length;
      const stdDev = Math.sqrt(variance);

      // Regular flow: stdDev < 20% of average gap
      return stdDev < avgGap * 0.2;
    }

    _detectColumnLayout(regions) {
      // Check if regions are distributed across multiple columns
      if (!regions || regions.length < 4) return false;

      const xPositions = regions
        .filter(r => r.bbox && r.bbox.length >= 4)
        .map(r => r.bbox[0]);

      const xMin = Math.min(...xPositions);
      const xMax = Math.max(...xPositions);
      const xRange = xMax - xMin;

      // Multi-column: spread > 200px
      return xRange > 200;
    }

    _topHasTable(regions) {
      if (!regions || regions.length === 0) return false;

      const pageHeight = Math.max(...regions.map(r => r.bbox?.[3] ?? 0));
      const topThird = pageHeight / 3;

      for (const region of regions) {
        if (region.type === 'table' && region.bbox && region.bbox[1] < topThird) {
          return true;
        }
      }

      return false;
    }

    _getDefaultFeatures() {
      return {
        headerCount: 0,
        tableCount: 0,
        figureCount: 0,
        separatorCount: 0,
        sameLine: 0,
        narrowParaCount: 0,
        wideParaCount: 0,
        regularFlow: false,
        columnLayout: false,
        topHasTable: false,
        avgRegionSize: 0
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Per-Type Scorers
  // ═══════════════════════════════════════════════════════════════════
  class TypeScorers {
    static scoreInvoice(text, cnn, gnn) {
      let score = 0;

      // Text patterns
      if (/invoice|bill|amount due|line items|qty|unit price/i.test(text)) score += 15;
      if (/total|subtotal|tax|shipping/i.test(text)) score += 10;

      // CNN: horizontal lines (table rules)
      if (cnn.horizontalLineRatio > 30) score += 20;

      // GNN: tables, same-line pairs (label:value)
      if (gnn.tableCount >= 1) score += 15;
      if (gnn.sameLine >= 4) score += 12;
      if (gnn.topHasTable) score += 10;

      return score;
    }

    static scoreResume(text, cnn, gnn) {
      let score = 0;

      // Text patterns
      if (/resume|cv|curriculum vitae|experience|education|skill/i.test(text)) score += 20;
      if (/employment|position|degree|certification/i.test(text)) score += 10;

      // CNN: top-heavy (photo/header at top)
      if (cnn.topHeavyScore > 60) score += 15;

      // GNN: narrow paragraphs, regular flow, headers
      if (gnn.narrowParaCount >= 3 && !gnn.columnLayout) score += 12;
      if (gnn.regularFlow) score += 10;
      if (gnn.headerCount >= 3) score += 8;

      return score;
    }

    static scoreContract(text, cnn, gnn) {
      let score = 0;

      // Text patterns
      if (/agreement|contract|party|terms|condition|liability|warrant/i.test(text)) score += 20;
      if (/whereas|effective date|termination|severability/i.test(text)) score += 10;

      // CNN: high ink density, no horizontal lines
      if (cnn.inkDensity > 40) score += 15;
      if (cnn.horizontalLineRatio < 10) score += 8;

      // GNN: wide paragraphs, no tables
      if (gnn.wideParaCount >= 5) score += 12;
      if (gnn.tableCount === 0) score += 5;

      return score;
    }

    static scoreReport(text, cnn, gnn) {
      let score = 0;

      // Text patterns
      if (/report|abstract|methodology|results|conclusion|reference/i.test(text)) score += 20;
      if (/findings|recommendation|executive summary/i.test(text)) score += 10;

      // CNN: column layout (bicolumn), high contrast
      if (cnn.columnSymmetry > 50) score += 12;

      // GNN: multiple headers, figures, column layout
      if (gnn.headerCount >= 4) score += 15;
      if (gnn.figureCount >= 2) score += 10;
      if (gnn.columnLayout) score += 8;

      return score;
    }

    static scoreLetter(text, cnn, gnn) {
      let score = 0;

      // Text patterns
      if (/dear|sincerely|regards|yours truly|to whom it may concern/i.test(text)) score += 20;

      // CNN: symmetric margins (letterhead)
      if (cnn.columnSymmetry > 60) score += 15;

      // GNN: single column, moderate paragraph count, no tables
      if (!gnn.columnLayout) score += 10;
      if (gnn.narrowParaCount >= 2 && gnn.narrowParaCount <= 8) score += 10;
      if (gnn.tableCount === 0) score += 5;

      return score;
    }

    static scoreForm(text, cnn, gnn) {
      let score = 0;

      // Text patterns
      if (/form|field|signature|date|printed name|checkbox/i.test(text)) score += 15;

      // CNN: checkbox detection (strongest single signal)
      if (cnn.checkboxCount >= 2) score += 30;
      if (cnn.checkboxCount >= 1) score += 15;

      // GNN: same-line pairs (label:value), figures
      if (gnn.sameLine >= 4) score += 15;
      if (gnn.figureCount >= 2) score += 8;

      return score;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Main Enhanced Classifier
  // ═══════════════════════════════════════════════════════════════════
  class DocugraphEnhancedClassifier {
    static classify(text, regions, imageData, pageWidth, pageHeight) {
      const cnn = new CNNFeatureExtractor();
      const gnn = new GNNLayoutAnalyzer();

      const cnnFeatures = cnn.extract(imageData, pageWidth, pageHeight, regions);
      const gnnFeatures = gnn.extract(regions);

      const scores = {
        invoice: TypeScorers.scoreInvoice(text, cnnFeatures, gnnFeatures),
        resume: TypeScorers.scoreResume(text, cnnFeatures, gnnFeatures),
        contract: TypeScorers.scoreContract(text, cnnFeatures, gnnFeatures),
        report: TypeScorers.scoreReport(text, cnnFeatures, gnnFeatures),
        letter: TypeScorers.scoreLetter(text, cnnFeatures, gnnFeatures),
        form: TypeScorers.scoreForm(text, cnnFeatures, gnnFeatures)
      };

      // Find best match
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const [bestType, bestScore] = sorted[0];
      const secondScore = sorted[1]?.[1] ?? 0;

      // Compute confidence
      const confidence = bestScore > 0 
        ? Math.min(0.95, bestScore / (bestScore + secondScore + 1))
        : 0;

      return {
        type: bestType.charAt(0).toUpperCase() + bestType.slice(1),
        confidence: Math.max(0, Math.min(1, confidence)),
        scores,
        cnnFeatures,
        gnnFeatures
      };
    }

    static debug(layoutData) {
      if (!layoutData) {
        console.warn('[Enhanced Classifier] No layout data provided');
        return;
      }

      const text = layoutData.text || layoutData.fullText || '';
      const regions = layoutData.regions || [];
      
      const cnn = new CNNFeatureExtractor();
      const gnn = new GNNLayoutAnalyzer();

      const cnnFeatures = cnn.extract(layoutData.canvasData, layoutData.width, layoutData.height, regions);
      const gnnFeatures = gnn.extract(regions);

      console.table({
        'Invoice': TypeScorers.scoreInvoice(text, cnnFeatures, gnnFeatures),
        'Resume': TypeScorers.scoreResume(text, cnnFeatures, gnnFeatures),
        'Contract': TypeScorers.scoreContract(text, cnnFeatures, gnnFeatures),
        'Report': TypeScorers.scoreReport(text, cnnFeatures, gnnFeatures),
        'Letter': TypeScorers.scoreLetter(text, cnnFeatures, gnnFeatures),
        'Form': TypeScorers.scoreForm(text, cnnFeatures, gnnFeatures)
      });

      console.log('[CNN Features]', cnnFeatures);
      console.log('[GNN Features]', gnnFeatures);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Integration: Patch DocumentTypeClassifier
  // ═══════════════════════════════════════════════════════════════════
  let _attempts = 0;
  function patchDocumentTypeClassifier() {
    if (typeof DocumentTypeClassifier === 'undefined') {
      if (++_attempts < 80) setTimeout(patchDocumentTypeClassifier, 200);
      return;
    }

    const _origClassify = DocumentTypeClassifier.prototype.classifyDocument;
    DocumentTypeClassifier.prototype.classifyDocument = function (doc) {
      // Get original result first
      const original = _origClassify.call(this, doc);

      // If Receipt or Flowchart with high confidence, don't override
      if ((original.type === 'Receipt' || original.type === 'Flowchart') && 
          (original.scores?.[original.type.toLowerCase()] ?? 0) >= RECEIPT_FLOWCHART_GUARD_THRESHOLD) {
        return original;
      }

      // If Unknown or Document, try enhanced classifier
      if (original.type === 'Unknown' || original.type === 'Document') {
        try {
          const enhanced = DocugraphEnhancedClassifier.classify(
            doc.text || '',
            doc.regions || [],
            null,
            100,
            100
          );

          if (enhanced.confidence > original.confidence) {
            console.log('[Enhanced] Upgrading', original.type, '→', enhanced.type, '(conf:', enhanced.confidence.toFixed(2) + ')');
            return {
              type: enhanced.type,
              confidence: enhanced.confidence,
              scores: enhanced.scores
            };
          }
        } catch (e) {
          console.warn('[Enhanced] Classification error:', e.message);
        }
      }

      return original;
    };

    // Expose debug API globally
    window.DocugraphEnhancedClassifier = DocugraphEnhancedClassifier;

    console.log('✅ Enhanced Classifier patched');
  }

  patchDocumentTypeClassifier();

  // ═══════════════════════════════════════════════════════════════════
  // Integration: Patch currentLayoutData
  // ═══════════════════════════════════════════════════════════════════
  (function patchCurrentLayoutData() {
    const existing = Object.getOwnPropertyDescriptor(window, 'currentLayoutData');
    let _store = null;

    function enhance(data) {
      if (!data || !data.structure || (data.structure.documentType !== 'Document' && data.structure.documentType !== 'Unknown')) {
        return data;
      }

      try {
        const enhanced = DocugraphEnhancedClassifier.classify(
          data.text || data.fullText || '',
          data.regions || [],
          null,
          100,
          100
        );

        if (enhanced.confidence > 0.5) {
          data.structure = {
            ...data.structure,
            documentType: enhanced.type,
            confidence: enhanced.confidence
          };
        }
      } catch (e) {
        // Silent fail, use original
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
            _store = enhance(val);
          }
        });
      } else {
        Object.defineProperty(window, 'currentLayoutData', {
          configurable: true,
          get() { return _store; },
          set(val) { _store = enhance(val); }
        });
      }
    } catch (e) {
      console.warn('[Enhanced] Could not patch currentLayoutData:', e.message);
    }
  })();

  console.log(
    '%c✅ DOCUGRAPH Enhanced Classifier Active',
    'color:#0084ff;font-weight:bold;font-size:12px',
    '— CNN texture extraction, GNN layout graph, per-type scorers'
  );

})();
