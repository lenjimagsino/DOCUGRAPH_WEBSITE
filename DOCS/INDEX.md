# DOCUGRAPH Documentation Hub

Welcome to DOCUGRAPH - Advanced AI-Powered Document Analysis & OCR Platform.

## 🚀 Quick Start

**New to DOCUGRAPH?** Start here:
1. [Setup Guide](SETUP.md) - Installation, configuration, and deployment
2. [README.md](../README.md) - Project overview and features

## 📚 Core Documentation

### Essential Guides
- **[Setup Guide](SETUP.md)** - Complete setup and deployment instructions
  - Backend installation and configuration
  - Frontend Firebase setup
  - Testing and verification
  - Production deployment
  - Troubleshooting

### Features & Capabilities
DOCUGRAPH provides 8+ advanced document analysis features:
- 🧠 **Advanced OCR** - Multi-pass text recognition with preprocessing
- 📊 **Layout Detection** - Automatic column and structure analysis  
- 🌍 **Multilingual Support** - 12+ languages with auto-detection
- 🔗 **Graph Neural Networks** - Hierarchical document understanding
- 🧬 **Semantic Analysis** - BERT-based error correction
- 📈 **Embeddings** - XLM-R multilingual embeddings (768-dim)
- 🔄 **Auto-Translation** - Real-time document translation
- 💾 **Batch Processing** - Process multiple documents efficiently

## 📂 Project Structure

```
DOCUGRAPH_WEBSITE/
├── index.html              # Main landing page
├── login.html              # User authentication
├── dashboard.html          # User dashboard
├── try.html                # Main analysis interface
├── results.html            # Analysis results viewer
├── analytics.html          # Analytics dashboard
├── README.md               # Main documentation
├── backend/
│   ├── app.py              # Flask API server
│   ├── run_production.py    # Production server manager
│   ├── requirements.txt     # Python dependencies
│   └── uploads/            # Document storage
├── assets/
│   ├── main.js             # Frontend JavaScript engines
│   ├── style.css           # Styling
│   ├── firebase-config.js  # Firebase configuration
│   └── auth.js             # Authentication helpers
└── DOCS/
    ├── SETUP.md            # Setup and deployment guide
    ├── INDEX.md            # This file
    └── ARCHIVE/            # Historical documentation
```

## 🔧 Development

### Running Locally

1. **Start Backend**:
   ```bash
   cd backend
   python run_production.py
   ```

2. **Open Website**:
   - Open `index.html` in browser or
   - Serve with local web server

### Verification

Run the feature verification script:
```bash
python verify_features.py
```

## 🌐 Production Deployment

For production deployment on docugraph.site:

1. **Backend Setup** - Follow [Setup Guide](SETUP.md) production section
2. **Configure Systemd** - For Linux auto-startup
3. **Enable CORS** - Whitelists docugraph.site domain
4. **SSL/TLS** - Use HTTPS for production

## 📞 Support & Troubleshooting

### Common Issues

**Website says backend is not responding?**
- Ensure backend is running on port 5000
- Check firewall rules
- Verify CORS configuration
- See [Setup Guide](SETUP.md) troubleshooting section

**OCR not working?**
- Verify Tesseract.js loaded in browser
- Check browser console for errors
- Run `diagnoseDOCUGRAPH()` in browser console for diagnostics

**Language detection failing?**
- Check supported languages: 12 languages included
- Verify language code is correct (e.g., 'eng', 'fra', 'deu')
- Check browser console for specific errors

## 🏗️ Architecture

### Frontend Stack
- HTML5 with vanilla JavaScript
- Firebase for authentication
- Tesseract.js for OCR
- Canvas API for image processing
- XLM-R for embeddings

### Backend Stack
- Python 3.8+ with Flask
- Gunicorn WSGI server
- EasyOCR for text recognition
- LayoutParser for document analysis
- Transformers for NLP models

## 📝 API Reference

### Health Check
```
GET /health
Response: { "status": "healthy", "version": "6.0.0" }
```

### Layout Analysis
```
POST /api/v1/layout/analyze
Body: { "image": "<base64>" }
```

### OCR Extraction
```
POST /api/v1/ocr/extract
Body: { "image": "<base64>", "language": "eng" }
```

### Embeddings
```
POST /api/v1/embeddings/generate
Body: { "text": "...", "language": "eng" }
```

## 📜 Additional Resources

- **[Setup Guide](SETUP.md)** - Detailed setup instructions
- **[Archived Docs](ARCHIVE/)** - Historical documentation and phase-specific guides
- **[Main README](../README.md)** - Project overview

---

**Last Updated:** May 20, 2026 | Documentation Index

## 🚀 Quick Links

- **Website:** https://docugraph.site
- **Repository:** GitHub
- **Backend API:** https://docugraph.site:5000
- **Health Check:** https://docugraph.site:5000/health
- **API Docs:** https://docugraph.site:5000/diagnostics

---

## ✨ Key Features

- Advanced OCR with preprocessing
- Graph Neural Network analysis
- Multilingual support (12+ languages)
- Document segmentation
- Shape & flowchart detection
- 24/7 backend operation
- Firebase authentication

---

Last Updated: May 20, 2026
