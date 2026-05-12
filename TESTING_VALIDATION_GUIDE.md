# 🧪 DOCUGRAPH Phase 1-5 Testing & Validation Guide

**Last Updated**: May 2026  
**Status**: Ready for Comprehensive Testing  
**Estimated Test Time**: 2-4 hours

---

## Test Environment Setup

### Prerequisites
- Browser: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- Network: Internet access (for ML model CDN loading)
- Storage: 300MB free disk space, 50MB IndexedDB quota
- Memory: Minimum 2GB RAM (4GB+ recommended)

### Test Documents Checklist
- [ ] Clean, high-quality scanned document
- [ ] Low-contrast document (poor lighting simulation)
- [ ] Handwritten text (if available)
- [ ] Multi-column layout document
- [ ] Mixed language document (2+ languages)
- [ ] Complex document (tables, figures, headers)
- [ ] Document with text overlays/watermarks
- [ ] High-resolution image (5000x5000+)
- [ ] Low-resolution image (500x500)
- [ ] Rotated/skewed document

---

## Phase 1: CLAHE & Morphology Testing

### Test 1.1: CLAHE Thresholding on Low-Contrast Images
**Objective**: Verify CLAHE improves thresholding on poorly lit documents

**Steps**:
1. Open try.html in browser
2. Upload a low-contrast document (simulate poor lighting)
3. In browser console:
```javascript
const engine = new SmartOCREngine();
await engine.initialize();

// Get preprocessing canvas
const canvas = document.getElementById('canvas');
const processed = await engine.preprocessor.preprocessImage(canvas);

// Check console logs for:
// ✓ Adaptive CLAHE thresholding
// ✓ Advanced morphological operations
```

**Expected Results**:
- ✅ CLAHE processing completes in 100-200ms
- ✅ Console shows both CLAHE and morphology success logs
- ✅ Processed image shows improved contrast
- ✅ Text regions clearly separated from background

**Pass Criteria**: 
- [ ] Processing time < 300ms
- [ ] Console shows no errors
- [ ] Processed image quality improved
- [ ] OCR accuracy on result > 70%

---

### Test 1.2: Morphological Operations on Noisy Documents
**Objective**: Verify advanced morphology cleans up text noise

**Steps**:
1. Upload a noisy/low-quality scanned document
2. Run preprocessing:
```javascript
const engine = new SmartOCREngine();
const canvas = document.getElementById('canvas');
const processed = await engine.preprocessor.preprocessImage(canvas);

// Monitor console output for:
// ✓ Morphological opening
// ✓ Morphological closing
// ✓ Top-hat transform
```

**Expected Results**:
- ✅ Opening removes small noise particles
- ✅ Closing fills gaps in characters
- ✅ Top-hat preserves fine details
- ✅ Blending combines all improvements

**Pass Criteria**:
- [ ] All 3 morphology operations complete
- [ ] No console errors
- [ ] Resulting image has <5% noise
- [ ] Character strokes remain intact

---

## Phase 2: BERT Semantic Correction Testing

### Test 2.1: BERT Initialization & Loading
**Objective**: Verify BERT model loads successfully

**Steps**:
1. Open console and run:
```javascript
const engine = new SmartOCREngine();
console.time('BERT Load');
await engine.bertCorrector.initialize();
console.timeEnd('BERT Load');
```

**Expected Results**:
- ✅ BERT loads from CDN (takes 1-3s first time)
- ✅ Model cached in memory
- ✅ `isInitialized` flag set to true
- ✅ No network errors

**Pass Criteria**:
- [ ] First load completes in < 5 seconds
- [ ] `bertCorrector.isInitialized === true`
- [ ] Subsequent calls use cache

---

### Test 2.2: Context-Aware Spell Correction
**Objective**: Verify BERT provides intelligent corrections

**Steps**:
```javascript
const engine = new SmartOCREngine();
await engine.initialize();

// Test 1: Common misspelling
const suggestions1 = await engine.bertCorrector.suggestCorrectionsBERT(
  'teh',
  'The quick brown fox is teh fastest'
);
console.log('Test 1 (teh):', suggestions1);
// Expected: [{ word: 'the', confidence: 0.95+, source: 'BERT' }, ...]

// Test 2: Context-dependent
const suggestions2 = await engine.bertCorrector.suggestCorrectionsBERT(
  'write',
  'I must write this document carefully'
);
console.log('Test 2 (write):', suggestions2);

// Test 3: Numbers/OCR errors
const suggestions3 = await engine.bertCorrector.suggestCorrectionsBERT(
  'l0l',
  'The l0l symbol was incorrect'
);
console.log('Test 3 (l0l→lol):', suggestions3);
```

**Expected Results**:
- ✅ BERT suggests contextually appropriate corrections
- ✅ Confidence scores reflect relevance (0.7+)
- ✅ Multiple suggestions ranked by score
- ✅ Fallback to Levenshtein if BERT unavailable

**Pass Criteria**:
- [ ] All 3 tests return suggestions
- [ ] Top suggestion has confidence > 0.7
- [ ] Suggestions contextually relevant
- [ ] < 1s processing time per word (cached)

---

### Test 2.3: Levenshtein Fallback
**Objective**: Verify fallback works when BERT unavailable

**Steps**:
```javascript
// Create fallback corrector without BERT
const fallbackCorrector = new BERTSemanticCorrector();
fallbackCorrector.isInitialized = false;

const suggestions = fallbackCorrector.suggestCorrectionsLevenshtein('teh', 5);
console.log('Levenshtein suggestions:', suggestions);
// Expected: [{ word: 'the', confidence: 0.8-0.9, source: 'Levenshtein' }, ...]
```

**Expected Results**:
- ✅ Fallback provides string similarity results
- ✅ Results contextually reasonable
- ✅ Processing < 50ms
- ✅ Works offline

**Pass Criteria**:
- [ ] Suggestions provided without BERT
- [ ] Top suggestion confidence > 0.7
- [ ] Response time < 100ms
- [ ] Works with or without internet

---

## Phase 3: GAT (Graph Attention Network) Testing

### Test 3.1: Graph Construction
**Objective**: Verify GAT builds correct document graph

**Steps**:
```javascript
const engine = new SmartOCREngine();
await engine.initialize();

// Create sample regions
const regions = [
  { text: 'Title', type: 'header', bbox: [10, 10, 200, 40], confidence: 0.95 },
  { text: 'Paragraph 1', type: 'para', bbox: [10, 50, 200, 100], confidence: 0.88 },
  { text: '[Figure]', type: 'figure', bbox: [210, 50, 350, 150], confidence: 0.85 },
  { text: 'Paragraph 2', type: 'para', bbox: [10, 160, 200, 210], confidence: 0.90 }
];

const graph = engine.gat.buildGraphFromRegions(regions, 400, 300);
console.log('Graph nodes:', graph.nodes.length);
console.log('Graph edges:', graph.edges.length);
console.log('First node features:', graph.nodes[0].features);
```

**Expected Results**:
- ✅ 4 nodes created (one per region)
- ✅ Multiple edges with similarity > 0.3
- ✅ Features properly extracted (10 dimensions)
- ✅ Edge features computed (4 dimensions)

**Pass Criteria**:
- [ ] Nodes count matches regions
- [ ] All nodes have 10-dim features
- [ ] Edges > 0
- [ ] All edges have 4-dim features
- [ ] Console shows "Built GAT with X nodes, Y edges"

---

### Test 3.2: Context Propagation
**Objective**: Verify GAT propagates context correctly

**Steps**:
```javascript
const engine = new SmartOCREngine();

// Build graph (from previous test)
const graph = engine.gat.buildGraphFromRegions(regions, 400, 300);

// Store original features
const originalFeatures = graph.nodes.map(n => [...n.features]);

// Propagate context
engine.gat.propagateContext(2); // 2 iterations

// Check feature changes
graph.nodes.forEach((node, i) => {
  const changed = originalFeatures[i].some((val, j) => 
    Math.abs(val - node.features[j]) > 0.01
  );
  console.log(`Node ${i} features changed:`, changed);
});
```

**Expected Results**:
- ✅ Features change after propagation (nodes receive neighbor context)
- ✅ Changes are meaningful (not random)
- ✅ Feature norms approximately 1.0 (normalized)
- ✅ Processing < 500ms for 100 nodes

**Pass Criteria**:
- [ ] Features change for most nodes
- [ ] Changes < 0.5 per dimension (stable)
- [ ] All features in [0, 1] range
- [ ] No NaN values

---

### Test 3.3: Relationship Detection
**Objective**: Verify GAT detects document relationships

**Steps**:
```javascript
const relationships = engine.gat.detectRelationships();
console.log('Detected relationships:', relationships);
// Expected output:
// [
//   { from: 0, to: 1, type: 'header_content', strength: 0.8+ },
//   { from: 1, to: 2, type: 'text_figure', strength: 0.7+ },
//   { from: 2, to: 3, type: 'spatial', strength: 0.6+ }
// ]
```

**Expected Results**:
- ✅ Header→Paragraph detected as 'header_content'
- ✅ Paragraph→Figure detected as 'text_figure'
- ✅ All relationships have strength > 0.3
- ✅ Relationship types match region types

**Pass Criteria**:
- [ ] Relationships detected
- [ ] Types appropriate for regions
- [ ] Strength values reasonable (0.3-0.95)
- [ ] Relationships make semantic sense

---

## Phase 4: XLM-R Multilingual Testing

### Test 4.1: Language Detection
**Objective**: Verify XLM-R detects languages correctly

**Steps**:
```javascript
const engine = new SmartOCREngine();
await engine.initialize();

// Test various languages
const testCases = [
  { text: 'The quick brown fox', expected: 'en' },
  { text: 'Le renard brun rapide', expected: 'fr' },
  { text: 'El rápido zorro marrón', expected: 'es' },
  { text: 'Der schnelle braune Fuchs', expected: 'de' },
  { text: '快速的棕色狐狸', expected: 'zh' },
  { text: 'السلام عليكم', expected: 'ar' },
  { text: 'Привет мир', expected: 'ru' }
];

for (const test of testCases) {
  const detected = await engine.multilingualLayer.detectLanguage(test.text);
  const correct = detected === test.expected;
  console.log(`${test.text.substring(0, 20)}: ${detected} (${correct ? '✓' : '✗'})`);
}
```

**Expected Results**:
- ✅ English detected correctly
- ✅ Romance languages detected correctly
- ✅ Germanic languages detected correctly
- ✅ CJK languages detected correctly (may be less accurate)
- ✅ Arabic/Hebrew detected correctly

**Pass Criteria**:
- [ ] 6+ out of 7 languages detected correctly
- [ ] Detection < 50ms
- [ ] No console errors
- [ ] Edge cases handled gracefully

---

### Test 4.2: Cross-Lingual Embeddings
**Objective**: Verify XLM-R computes multilingual embeddings

**Steps**:
```javascript
const engine = new SmartOCREngine();
await engine.initialize();

// Get embeddings for same meaning in different languages
const emb_en = await engine.multilingualLayer.getEmbedding('hello');
const emb_es = await engine.multilingualLayer.getEmbedding('hola');
const emb_fr = await engine.multilingualLayer.getEmbedding('bonjour');

// Calculate similarities
const sim_en_es = engine.multilingualLayer.cosineSimilarity(emb_en, emb_es);
const sim_en_fr = engine.multilingualLayer.cosineSimilarity(emb_en, emb_fr);
const sim_es_fr = engine.multilingualLayer.cosineSimilarity(emb_es, emb_fr);

console.log(`hello-hola similarity: ${sim_en_es.toFixed(2)}`);
console.log(`hello-bonjour similarity: ${sim_en_fr.toFixed(2)}`);
console.log(`hola-bonjour similarity: ${sim_es_fr.toFixed(2)}`);
// Expected: 0.5+
```

**Expected Results**:
- ✅ All embeddings generated (768 dimensions)
- ✅ Similarities > 0.5 (same concept)
- ✅ Embeddings are normalized (norm ≈ 1.0)
- ✅ First call ~1.5s, cached calls <5ms

**Pass Criteria**:
- [ ] All 3 embeddings generated
- [ ] All similarities > 0.4
- [ ] Similarities reasonable (related words higher)
- [ ] No NaN or Inf values

---

## Phase 5: User Feedback Loop Testing

### Test 5.1: IndexedDB Initialization
**Objective**: Verify feedback database initializes

**Steps**:
```javascript
const engine = new SmartOCREngine();
await engine.feedbackCollector.initializeDB();

console.log('IndexedDB initialized:', engine.feedbackCollector.db !== null);

// Check database exists
const dbs = await window.indexedDB.databases();
const docugraphDB = dbs.find(db => db.name === 'DOCUGRAPH_Feedback');
console.log('DOCUGRAPH_Feedback database:', docugraphDB ? '✓' : '✗');
```

**Expected Results**:
- ✅ Database initializes without errors
- ✅ Database appears in browser's IndexedDB list
- ✅ Object store 'corrections' created
- ✅ Indices created (originalWord, language, timestamp)

**Pass Criteria**:
- [ ] No console errors
- [ ] Database accessible
- [ ] Object store exists
- [ ] Indices created

---

### Test 5.2: Recording Corrections
**Objective**: Verify feedback is stored correctly

**Steps**:
```javascript
const engine = new SmartOCREngine();
await engine.feedbackCollector.initializeDB();

// Record multiple corrections
const corrections = [
  { word: 'teh', correction: 'the', context: 'The quick', language: 'en', confidence: 0.65, model: 'BERT' },
  { word: 'wrld', correction: 'world', context: 'Hello wrld', language: 'en', confidence: 0.55, model: 'BERT' },
  { word: 'helo', correction: 'hello', context: 'helo there', language: 'en', confidence: 0.70, model: 'Levenshtein' }
];

for (const corr of corrections) {
  const id = await engine.feedbackCollector.recordCorrection(corr);
  console.log(`Correction ${id} recorded`);
}
```

**Expected Results**:
- ✅ Each correction returns unique ID
- ✅ IDs increment (1, 2, 3...)
- ✅ No errors during storage
- ✅ Data persists across page reloads

**Pass Criteria**:
- [ ] 3 corrections recorded
- [ ] IDs are sequential
- [ ] No console errors
- [ ] Records persist (refresh page and query)

---

### Test 5.3: Statistics Generation
**Objective**: Verify feedback statistics are computed

**Steps**:
```javascript
// After recording corrections (from previous test)
const stats = await engine.feedbackCollector.getStatistics();

console.log('Total corrections:', stats.totalCorrections);
console.log('By language:', stats.byLanguage);
console.log('By model:', stats.byModel);
console.log('Common errors:', stats.commonErrors);
```

**Expected Results**:
- ✅ Total count correct (3)
- ✅ Language distribution: { en: 3 }
- ✅ Model distribution: { BERT: 2, Levenshtein: 1 }
- ✅ Common errors sorted by frequency

**Pass Criteria**:
- [ ] Stats computed without errors
- [ ] Counts accurate
- [ ] Distribution logical
- [ ] Top errors listed correctly

---

## Phase 6: Layout Visualization Testing

### Test 6.1: SVG Rendering
**Objective**: Verify document layout visualization

**Steps**:
1. Add container to try.html:
```html
<div id="layoutVisualization" style="width: 1000px; height: 800px; border: 1px solid #ccc;"></div>
```

2. Run visualization:
```javascript
const engine = new SmartOCREngine();

const regions = [
  { text: 'Title', type: 'header', bbox: [10, 10, 200, 40], confidence: 0.95 },
  { text: 'Content', type: 'para', bbox: [10, 50, 200, 150], confidence: 0.88 },
  { text: 'Table', type: 'table', bbox: [210, 50, 450, 150], confidence: 0.92 }
];

engine.visualizer.visualizeLayout({ regions });
```

**Expected Results**:
- ✅ SVG renders in container
- ✅ Rectangles appear for each region
- ✅ Colors match region types (green=header, light green=para, orange=table)
- ✅ Rectangles positioned correctly

**Pass Criteria**:
- [ ] SVG visible
- [ ] 3 rectangles rendered
- [ ] Colors correct
- [ ] Positions approximately correct

---

### Test 6.2: Interactive Hover
**Objective**: Verify hover tooltips work

**Steps**:
1. Move mouse over rendered region rectangles
2. Observe hover effects
3. Check browser console for interaction logs

**Expected Results**:
- ✅ Region highlight on hover (increased opacity)
- ✅ Stroke width increases
- ✅ Tooltip appears (title attribute)
- ✅ Hover state resets on mouse out

**Pass Criteria**:
- [ ] Visual feedback on hover
- [ ] Hover state resets properly
- [ ] Tooltip shows region type
- [ ] No errors on interaction

---

## Integration Testing

### Test I1: Full Pipeline
**Objective**: Verify entire analysis pipeline works end-to-end

**Steps**:
```javascript
const engine = new SmartOCREngine();
await engine.initialize();

// Get test image
const canvas = document.getElementById('canvas'); // or create from file

// Step 1: Preprocess
console.time('Full Pipeline');
const processed = await engine.preprocessor.preprocessImage(canvas);
console.log('Preprocessing complete');

// Step 2: OCR
const ocrResults = await engine.extractTextWithConfidence(processed, 'eng');
console.log('OCR complete:', ocrResults.words.length, 'words');

// Step 3: GAT Analysis
const graph = engine.gat.buildGraphFromRegions(ocrResults.regions || [], 500, 500);
engine.gat.propagateContext(2);
const relationships = engine.gat.detectRelationships();
console.log('GAT complete:', relationships.length, 'relationships');

// Step 4: Multilingual Analysis
const lang = await engine.multilingualLayer.detectLanguage(ocrResults.text);
console.log('Language detected:', lang);

// Step 5: Visualization
engine.visualizer.visualizeLayout({ regions: ocrResults.regions || [] });

console.timeEnd('Full Pipeline');
```

**Expected Results**:
- ✅ All steps complete successfully
- ✅ Total processing < 2 seconds (with caching)
- ✅ Results contain all expected fields
- ✅ No errors in any stage
- ✅ Console shows logical progression

**Pass Criteria**:
- [ ] Pipeline completes without error
- [ ] Performance acceptable (<3s)
- [ ] All output fields populated
- [ ] Visualization renders
- [ ] Results make semantic sense

---

## Performance Benchmarking

### Benchmark B1: Processing Speed
**Objective**: Measure actual performance

**Steps**:
```javascript
const testSizes = [
  { name: 'Small', words: 50 },
  { name: 'Medium', words: 500 },
  { name: 'Large', words: 5000 }
];

for (const size of testSizes) {
  console.time(`${size.name} (${size.words} words)`);
  
  // Create mock regions
  const regions = Array(size.words).fill(null).map((_, i) => ({
    text: `word${i}`,
    type: i % 4 === 0 ? 'header' : 'para',
    bbox: [10 + (i % 10) * 50, 10 + Math.floor(i / 10) * 20, 50, 30],
    confidence: 0.75 + Math.random() * 0.2
  }));

  // Process
  const graph = engine.gat.buildGraphFromRegions(regions, 1000, 1000);
  engine.gat.propagateContext(2);

  console.timeEnd(`${size.name} (${size.words} words)`);
}
```

**Expected Results**:
- ✅ Small: < 100ms
- ✅ Medium: 200-400ms
- ✅ Large: 1-2s
- ✅ Linear scaling with document size

**Pass Criteria**:
- [ ] Performance acceptable for use case
- [ ] No memory leaks
- [ ] Scaling reasonable
- [ ] No timeout errors

---

## Edge Case Testing

### Test E1: Empty Document
```javascript
const results = await engine.extractTextWithConfidence(emptyCanvas, 'eng');
console.log('Empty doc results:', results);
// Should handle gracefully with empty or minimal results
```

### Test E2: Very Large Document
```javascript
// Load 10MB+ image
const largeResults = await engine.extractTextWithConfidence(largeCanvas, 'eng');
// Should not crash, may take longer
```

### Test E3: Mixed Languages
```javascript
const mixedText = "Hello world. Bonjour le monde. Hola mundo.";
const regions = [{ text: mixedText, bbox: [0,0,100,100], type: 'para' }];
const lang = await engine.multilingualLayer.detectLanguage(mixedText);
// Should detect primary language or 'mixed'
```

### Test E4: All Fallbacks Disabled
```javascript
// Disable all ML models
engine.bertCorrector.isInitialized = false;
engine.multilingualLayer.isInitialized = false;
const results = await engine.extractTextWithConfidence(canvas, 'eng');
// Should still work with basic OCR + Levenshtein
```

---

## Success Criteria Summary

| Component | Pass Criteria |
|-----------|---------------|
| CLAHE | Processing <300ms, improved contrast |
| Morphology | All 3 operations complete, clean output |
| BERT | Model loads <5s, suggestions >0.7 confidence |
| GAT | Nodes and edges created, propagation works |
| XLM-R | Detects 6+/7 languages, embeddings generated |
| Feedback | Records stored, stats computed accurately |
| Visualization | SVG renders, interactivity works |
| Pipeline | All stages complete <3s, results complete |

---

## Reporting Results

After testing, create a summary:

```markdown
# Test Results Summary
- Date: [DATE]
- Tester: [NAME]
- Browser: [BROWSER VERSION]
- Platform: [OS]

## Overall Status
- [✓/✗] All tests passed
- [✓/✗] Performance acceptable
- [✓/✗] No critical errors

## Component Breakdown
- CLAHE: [PASS/FAIL] - Notes
- Morphology: [PASS/FAIL] - Notes
- BERT: [PASS/FAIL] - Notes
- GAT: [PASS/FAIL] - Notes
- XLM-R: [PASS/FAIL] - Notes
- Feedback: [PASS/FAIL] - Notes
- Visualization: [PASS/FAIL] - Notes

## Performance
- Average processing time: [TIME]
- Memory usage: [MB]
- Largest document tested: [SIZE]

## Issues Found
1. [Issue description]
2. [Issue description]

## Recommendations
- [Recommendation]
- [Recommendation]
```

---

## Next Steps

1. **Complete all tests** (2-4 hours)
2. **Document any issues** found
3. **Report performance metrics**
4. **Identify optimization opportunities**
5. **Plan production deployment**

---

**Status**: Ready for comprehensive testing  
**Estimated Coverage**: 95%+ of codebase  
**Test Maintenance**: Update as new features added

