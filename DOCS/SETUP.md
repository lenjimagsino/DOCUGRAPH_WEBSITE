# DOCUGRAPH - Setup Guide

## Prerequisites

- **Python 3.8+** (for backend)
- **Modern web browser** (Chrome, Firefox, Safari, Edge)
- **Node.js** (optional, for development tools)

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This installs:
- Flask (web framework)
- Gunicorn (production server)
- OpenCV (image processing)
- EasyOCR (text recognition)
- LayoutParser (document analysis)
- Transformers (NLP models)

### 2. Configure Environment (Optional)

Create `.env` file in `backend/` directory:

```
FLASK_ENV=production
PORT=5000
WORKERS=4
DEBUG=False
```

### 3. Start Backend Server

**Windows:**
```bash
backend\start_backend_windows.bat
```

**Linux/Mac:**
```bash
python backend/run_production.py
```

**Expected Output:**
```
🚀 DOCUGRAPH Backend API Server - Startup
================================================
✓ Backend running on http://localhost:5000
✓ Health endpoint: http://localhost:5000/health
✓ Auto-restart enabled
```

### 4. Verify Backend

```bash
curl http://localhost:5000/health
```

Should return:
```json
{
  "status": "healthy",
  "version": "6.0.0"
}
```

## Frontend Setup

### 1. Firebase Configuration

1. Go to https://console.firebase.google.com/
2. Create a new project
3. Add a Web app
4. Copy the `firebaseConfig` object
5. Edit `assets/firebase-config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_AUTH_DOMAIN",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

### 2. Enable Authentication Methods

In Firebase Console:
1. Go to Authentication > Sign-in method
2. Enable **Email/Password**
3. Enable **Google** (requires OAuth setup)
4. Enable **Microsoft** (requires OAuth setup)

### 3. Open Website

- **Development**: `file:///path/to/index.html` or `http://localhost/docugraph`
- **Production**: `https://docugraph.site`

## 🧪 Testing the Application

### 1. Create Test Account

1. Open website
2. Click "Sign Up"
3. Create account with email/password
4. Verify email

### 2. Test OCR & Analysis

1. Go to Dashboard → "Analyze Document"
2. Upload or select a test document
3. Wait for processing
4. View results with highlighted regions

### 3. Check Backend Status

```bash
curl http://localhost:5000/diagnostics
```

Shows installed packages and models.

## 🚨 Troubleshooting

### Backend won't start

**Error: "Python not found"**
- Install Python 3.8+
- Add Python to system PATH

**Error: "ModuleNotFoundError"**
```bash
pip install -r requirements.txt
```

**Error: "Port 5000 already in use"**
```bash
# Kill process on port 5000
lsof -i :5000 | grep -v PID | awk '{print $2}' | xargs kill -9
```

### Website shows CORS errors

1. Verify backend is running: `curl http://localhost:5000/health`
2. Hard refresh browser: `Ctrl+Shift+R`
3. Check browser console for exact error

### Firebase authentication not working

1. Verify Firebase credentials in `assets/firebase-config.js`
2. Check Firebase Console has authentication enabled
3. Check browser console for Firebase errors

### OCR features not working

1. Verify EasyOCR: `python -c "import easyocr"`
2. Install if needed: `pip install easyocr`
3. Check `/diagnostics` endpoint for model status

## 📦 Production Deployment

### Deploy Backend

1. **Copy files to server**:
```bash
scp -r backend/ user@docugraph.site:/var/www/
```

2. **Install dependencies**:
```bash
ssh user@docugraph.site
cd /var/www/backend
pip install -r requirements.txt
```

3. **Start service**:
```bash
sudo systemctl start docugraph-backend
sudo systemctl enable docugraph-backend
```

### Deploy Frontend

1. **Copy HTML/CSS/JS to web server**:
```bash
scp index.html login.html *.html user@docugraph.site:/var/www/html/
scp -r assets/ user@docugraph.site:/var/www/html/
```

2. **Configure Nginx reverse proxy** for backend

## 📚 Additional Resources

- [Backend Production Setup](BACKEND_PRODUCTION_SETUP.md)
- [Deployment Configuration](DEPLOYMENT_CONFIGURATION.md)
- [API Reference](API_REFERENCE.md)
- [Features Documentation](FEATURES_TRANSFER_COMPLETE.md)

---

**Last Updated:** May 20, 2026
