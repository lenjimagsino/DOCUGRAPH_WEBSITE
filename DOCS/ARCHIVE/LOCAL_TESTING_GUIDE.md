# 🚀 DOCUGRAPH Local Testing Guide

**Try DOCUGRAPH locally in 3 ways**

---

## ⚡ OPTION 1: INSTANT (No Setup - 30 seconds)

### Just Open It
```bash
# Navigate to folder
cd c:\Users\mlenj\Music\DOCUGRAPH_WEBSITE

# Open in browser (Windows)
start try.html

# Or drag try.html to your browser
```

✅ **Works immediately** - all 8 phases active  
✅ **No dependencies needed**  
✅ **Translation uses client-side API**  
✅ **User feedback stored locally in browser**

**What you'll see**:
- Upload document interface
- OCR results with confidence scores
- Hierarchy view (Phase 7)
- Translation options (Phase 8)
- Quality metrics display

---

## 🔧 OPTION 2: WITH BACKEND (Recommended - 10 minutes)

### Prerequisites
- Python 3.10+ installed
- Tesseract.js works via CDN (automatic)

### Step 1: Install Backend Dependencies
```bash
cd c:\Users\mlenj\Music\DOCUGRAPH_WEBSITE\backend

# Create virtual environment
python -m venv venv

# Activate it
venv\Scripts\activate

# Install packages (takes ~5 minutes first time)
pip install -r requirements.txt
```

### Step 2: Start Backend
```bash
# From backend folder (with venv active)
python app.py
```

You should see:
```
 * Running on http://127.0.0.1:5000
✓ LayoutParser model loaded
✓ Semantic embedding model loaded
```

### Step 3: Open Frontend
- Open `try.html` in browser
- Backend automatically detected
- Advanced layout analysis enabled
- Faster embeddings

**What's enhanced**:
- Advanced layout detection (LayoutParser)
- Faster semantic embeddings
- Backend-powered translation
- Better accuracy on complex documents

---

## 🐳 OPTION 3: DOCKER (Cleanest - 15 minutes)

### Prerequisites
- Docker Desktop installed and running
- Docker Compose

### Step 1: Start Everything
```bash
cd c:\Users\mlenj\Music\DOCUGRAPH_WEBSITE

# Build and start
docker-compose up -d

# Wait ~30 seconds for services to start
```

### Step 2: Check Status
```bash
# See running containers
docker-compose ps

# Check backend health
curl http://localhost:5000/health
```

### Step 3: Open in Browser
```
http://localhost:80  (or just http://localhost)
```

**What you get**:
- Frontend on Nginx
- Backend on Flask
- Health checks active
- Logs available
- Easy to scale

### Stop Everything
```bash
docker-compose down
```

---

## 🧪 Testing Checklist

### Test Phase 1-5 (Smart OCR)
- [ ] Upload a document image
- [ ] See preprocessing with CLAHE
- [ ] Check confidence scores for each word
- [ ] Notice spell-check suggestions
- [ ] Review error flagging
- [ ] See quality metrics

### Test Phase 6 (Backend) - If Using Backend
- [ ] Click "Advanced Analysis" (if available)
- [ ] View layout detection
- [ ] Check semantic embeddings

### Test Phase 7 (Hierarchical GNN)
- [ ] Look at "Document Structure" section
- [ ] See hierarchy with sections, paragraphs, sentences
- [ ] Check confidence at each level

### Test Phase 8 (Translation)
- [ ] Click "Translate Document"
- [ ] Choose target language (Spanish, French, German, etc.)
- [ ] See translated text
- [ ] Try different languages
- [ ] Check cache speed (2nd translation is <1ms)

### Test Quality
- [ ] Check results tab displays well
- [ ] Export to JSON
- [ ] Export to PDF
- [ ] Copy to clipboard
- [ ] Switch between Text/JSON/Markdown tabs

---

## 📋 System Requirements

### Option 1 (Instant)
```
✅ Web browser (Chrome, Firefox, Safari, Edge)
✅ Nothing else needed!
```

### Option 2 (Backend)
```
✅ Python 3.10+
✅ 4GB RAM minimum
✅ 2GB disk space for models
✅ Internet (for first-time model download)
```

### Option 3 (Docker)
```
✅ Docker Desktop
✅ Docker Compose
✅ 8GB RAM recommended
✅ 5GB disk space
```

---

## 🔍 How to Test Each Phase

### Phase 1-5: OCR & Intelligence
```
1. Open try.html
2. Upload any document image
3. Wait for processing
4. See results in results.html
```

### Phase 6: Backend Analysis
```
1. Start backend (python app.py)
2. Open try.html
3. Backend automatically used
4. Check console for layout details
```

### Phase 7: Hierarchy
```
1. Upload document
2. Look for "Document Structure" section
3. Expand hierarchy to see:
   - Sections
   - Paragraphs
   - Sentences
   - Words
```

### Phase 8: Translation
```
1. Upload document
2. Scroll to "Translation Ready" section
3. Click "Translate to [Language]"
4. See translated document
5. Try different languages
6. Notice speed (cached results)
```

---

## 🛠️ Troubleshooting

### Issue: Backend won't start
```bash
# Check Python version
python --version  # Should be 3.10+

# Reinstall packages
pip install -r requirements.txt --force-reinstall

# Try without models (will auto-download)
python app.py
```

### Issue: Models downloading slowly
```
- First download: ~2GB (normal, ~5-10 min)
- Stored in: backend/models/ (or ~/.cache/)
- Subsequent starts: instant
- Can pre-download: See PHASE_6_8_COMPLETE.md
```

### Issue: Docker won't start
```bash
# Check Docker is running
docker ps

# Build fresh
docker-compose build --no-cache
docker-compose up -d

# Check logs
docker-compose logs backend
```

### Issue: try.html won't load
```bash
# Make sure try.html is in correct folder
cd c:\Users\mlenj\Music\DOCUGRAPH_WEBSITE
# Double-click try.html or drag to browser
```

---

## 📊 Testing Performance

### Measure Processing Time
```javascript
// In browser console
console.time('OCR');
// Upload document
console.timeEnd('OCR');
// Should see: OCR: ~2-4 seconds
```

### Check Accuracy
```javascript
// In console
// Look at confidence scores
// Should see improvement with phases
// Compare without/with backend
```

### Test Translation Speed
```javascript
// Cache test
engine.translationEngine.translate("Hello", "en", "es");  // ~1 second
engine.translationEngine.translate("Hello", "en", "es");  // <1ms (cached!)
```

---

## 🎯 Quick Start (TL;DR)

### Easiest
```bash
cd c:\Users\mlenj\Music\DOCUGRAPH_WEBSITE
start try.html
```

### With Backend
```bash
# Terminal 1
cd c:\Users\mlenj\Music\DOCUGRAPH_WEBSITE\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py

# Terminal 2
cd c:\Users\mlenj\Music\DOCUGRAPH_WEBSITE
start try.html
```

### With Docker
```bash
cd c:\Users\mlenj\Music\DOCUGRAPH_WEBSITE
docker-compose up -d
start http://localhost
```

---

## 📝 Testing Notes

Keep track of:
- [ ] Processing time
- [ ] Accuracy on different documents
- [ ] Translation quality
- [ ] Performance with backend vs without
- [ ] What works well
- [ ] Any issues found

---

## 📚 Reference Docs

- `DOCUGRAPH_QUICK_START.md` - Full user guide
- `PHASE_6_8_COMPLETE.md` - Technical details
- `backend/README.md` - Backend setup details
- `TESTING_VALIDATION_GUIDE.md` - Comprehensive tests

---

**Ready to test?** Start with Option 1 (instant) - just open try.html! 🚀

