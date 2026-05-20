# 📋 DOCUGRAPH Backend Configuration - Quick Reference

## 🎯 What Changed

Your website now points to **docugraph.site** backend instead of localhost.

## 🚀 Start Backend Server

```bash
cd backend
python run.py
```

Expected output:
```
🚀 DOCUGRAPH Backend API Server - Startup
============================================================
📡 CORS Configuration (Production Domains):
   ✓ https://docugraph.site
   ✓ https://www.docugraph.site
   ✓ http://localhost
...
```

## 🧪 Test It

### Option 1: Command Line
```bash
curl https://docugraph.site:5000/health
```

### Option 2: Browser
1. Go to `https://docugraph.site/try.html`
2. Press F12 → Console
3. Look for: `📡 Backend URL configured: https://docugraph.site:5000`

## 📝 Files Changed

| File | What | Why |
|------|------|-----|
| `try.html` | Added `window.BACKEND_URL` config | Route API calls to docugraph.site |
| `dashboard.html` | Added `window.BACKEND_URL` config | Route API calls to docugraph.site |
| `processing.html` | Added `window.BACKEND_URL` config | Route API calls to docugraph.site |
| `results.html` | Added `window.BACKEND_URL` config | Route API calls to docugraph.site |
| `backend/app.py` | Enhanced CORS + logging | Allow requests from docugraph.site |

## 🔌 Backend API Endpoints

All accessible at: `https://docugraph.site:5000/api/v1/`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/layout/analyze` | POST | Detect document structure |
| `/ocr/extract` | POST | Extract text from images |
| `/embeddings/generate` | POST | Generate text embeddings |
| `/embeddings/similarity` | POST | Compare text similarity |
| `/batch/analyze` | POST | Process multiple documents |
| `/health` | GET | Check if backend is running |
| `/diagnostics` | GET | View system status & models |

## ✅ Deployment Checklist

- [ ] Copy `backend/` folder to production server
- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Start backend: `python run.py`
- [ ] Test health endpoint: `curl https://docugraph.site:5000/health`
- [ ] Upload document to try.html and verify it works
- [ ] Check browser DevTools Network tab - APIs should show docugraph.site:5000

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot reach backend" | Verify port 5000 is open: `netstat -tulpn \| grep 5000` |
| CORS errors | Backend URL should be in `cors_origins` list in `app.py` |
| OCR not working | Install: `pip install easyocr` |
| Page still shows localhost | Hard refresh browser (Ctrl+Shift+R) |

## 📚 See Also

- `DEPLOYMENT_CONFIGURATION.md` - Full deployment guide
- `MIGRATION_COMPLETE.md` - What was changed and why
- `backend/README.md` - Backend-specific documentation

---

**Ready to deploy?** Follow the Quick Deployment steps above.
