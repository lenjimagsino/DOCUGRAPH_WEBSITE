# DOCUGRAPH Deployment Configuration Guide

## Overview

Your DOCUGRAPH website has been updated to use the production domain `docugraph.site` instead of localhost. All backend API calls now route to your production server.

## Changes Made

### 1. Frontend Configuration ✅

Updated HTML files with backend URL configuration:

- **try.html** - Document analysis page
- **dashboard.html** - User dashboard
- **processing.html** - Processing page
- **results.html** - Results page

Each file now includes a startup script that sets `window.BACKEND_URL`:

```javascript
window.BACKEND_URL = 'https://docugraph.site:5000';

// Fallback to localhost for development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.BACKEND_URL = 'http://localhost:5000';
}
```

**Benefits:**
- Automatically uses `https://docugraph.site:5000` when accessed from production
- Falls back to `http://localhost:5000` for local development
- No hardcoding required - same code works in both environments

### 2. Backend CORS Configuration ✅

**File:** `backend/app.py`

Enhanced CORS (Cross-Origin Resource Sharing) to allow requests from:

```
✓ https://docugraph.site
✓ https://www.docugraph.site
✓ http://localhost (development)
✓ http://localhost:3000 (development)
✓ http://localhost:5000 (development)
✓ http://127.0.0.1 (development)
```

CORS configuration details:
- **Allowed Methods:** GET, POST, PUT, DELETE, OPTIONS
- **Allowed Headers:** Content-Type, Authorization
- **Credentials:** Supported (for authenticated requests)
- **Cache Time:** 3600 seconds

### 3. Backend Startup Logging ✅

The backend now displays comprehensive startup information:

```
🚀 DOCUGRAPH Backend API Server - Startup
============================================================

📡 CORS Configuration (Production Domains):
   ✓ https://docugraph.site
   ✓ https://www.docugraph.site
   ✓ http://localhost
   ...

🔌 Server Configuration:
   Host: 0.0.0.0
   Port: 5000
   Debug Mode: False

🌐 Access URLs:
   Local: http://localhost:5000
   Production: https://docugraph.site:5000

📋 API Endpoints:
   Health: http://localhost:5000/health
   Diagnostics: http://localhost:5000/diagnostics
   ...
```

## Production Deployment Steps

### Step 1: Backend Server Setup

On your production server (where docugraph.site is hosted):

1. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Set up environment variables (optional):
```bash
export FLASK_ENV=production
export PORT=5000
export DEBUG=False
```

3. Start the backend server:
```bash
python run.py
```

Or directly:
```bash
python -m flask run --host=0.0.0.0 --port=5000
```

### Step 2: Web Server (Nginx/Apache) Configuration

To make the backend accessible at `https://docugraph.site:5000`, you have two options:

#### Option A: Direct Port Access (Simpler)
Ensure your firewall allows port 5000 traffic and the backend listens on `0.0.0.0:5000`.

#### Option B: Reverse Proxy with Nginx (Recommended for Production)

Add to your Nginx configuration:

```nginx
# Backend API proxy
upstream docugraph_backend {
    server 127.0.0.1:5000;
}

server {
    listen 443 ssl http2;
    server_name docugraph.site www.docugraph.site;
    
    # Your SSL certificates
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # Static frontend files
    location / {
        root /path/to/DOCUGRAPH_WEBSITE;
        index index.html;
        try_files $uri $uri/ =404;
    }
    
    # Backend API proxy
    location ~ ^/api/ {
        proxy_pass http://docugraph_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers (if needed)
        add_header 'Access-Control-Allow-Origin' '$http_origin' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT, User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Content-Type, Range' always;
        add_header 'Access-Control-Max-Age' '3600' always;
    }
}
```

### Step 3: Update Backend URL (if using custom port or domain)

If you're using a different port or domain, update:

1. **In HTML files** - Update the `window.BACKEND_URL`:
```javascript
window.BACKEND_URL = 'https://yourdomain.com:customport';
```

2. **In backend/app.py** - Update `cors_origins`:
```python
cors_origins = [
    'https://yourdomain.com',
    'https://www.yourdomain.com',
    # ... other origins
]
```

## Testing the Configuration

### 1. Test Health Endpoint

From browser or terminal:
```bash
curl https://docugraph.site:5000/health
```

Expected response:
```json
{
    "status": "healthy",
    "version": "6.0.0",
    "phase": "Phase 6: Python Backend",
    "models": {
        "layoutparser": true,
        "embeddings": true,
        "ocr": true
    }
}
```

### 2. Test Diagnostics

```bash
curl https://docugraph.site:5000/diagnostics
```

### 3. Test Frontend Connection

1. Open `https://docugraph.site/try.html`
2. Open browser DevTools (F12)
3. Go to Console tab
4. You should see: `📡 Backend URL configured: https://docugraph.site:5000`

### 4. Test Document Upload and Analysis

1. Upload a document on the Try page
2. Check browser DevTools > Network tab
3. Verify API calls go to `https://docugraph.site:5000/api/v1/...`
4. Check Console for any CORS errors

## API Endpoints

All endpoints use the configured backend URL:

### Layout Analysis
```
POST /api/v1/layout/analyze
```
Analyze document layout using LayoutParser and Detectron2.

### OCR Extraction
```
POST /api/v1/ocr/extract
```
Extract text from documents using EasyOCR.

### Embeddings Generation
```
POST /api/v1/embeddings/generate
```
Generate semantic embeddings for text.

### Embeddings Similarity
```
POST /api/v1/embeddings/similarity
```
Compute semantic similarity between texts.

### Batch Analysis
```
POST /api/v1/batch/analyze
```
Process multiple documents in batch.

## Environment Variables

Optional environment variables for the backend:

```bash
FLASK_ENV=production       # Set to 'production' for production
PORT=5000                  # Backend server port
DEBUG=False                # Disable debug mode in production
UPLOAD_FOLDER=./uploads    # Upload directory for processed files
```

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:

1. Verify the backend URL is set correctly:
   ```javascript
   console.log(window.BACKEND_URL)
   ```

2. Check that your domain is in the `cors_origins` list in `backend/app.py`

3. Test with curl:
   ```bash
   curl -H "Origin: https://docugraph.site" -v https://docugraph.site:5000/health
   ```

### Backend Not Responding

1. Check if the backend is running:
   ```bash
   netstat -tulpn | grep 5000
   ```

2. Test direct connection:
   ```bash
   curl http://127.0.0.1:5000/health
   ```

3. Check firewall rules:
   ```bash
   sudo ufw allow 5000
   ```

### OCR Features Not Working

1. Verify EasyOCR is installed:
   ```bash
   pip install easyocr
   ```

2. Check diagnostics:
   ```bash
   curl https://docugraph.site:5000/diagnostics
   ```

3. Check backend logs for initialization errors

## Security Notes

### For Production Deployment:

1. **Use HTTPS only:**
   - Update frontend to use `https://docugraph.site:5000`
   - Install SSL certificates on your server

2. **Firewall Configuration:**
   - Allow port 5000 only from necessary IPs if possible
   - Consider using a reverse proxy (Nginx) for port 443

3. **Authentication:**
   - Implement API key or token-based authentication if needed
   - Update CORS `allow_headers` if adding authentication

4. **Rate Limiting:**
   - Add rate limiting to prevent abuse
   - Consider implementing request throttling

5. **Monitoring:**
   - Set up logging for all API requests
   - Monitor backend resource usage (CPU, memory)
   - Set up alerts for failed requests

## Summary of Changes

| File | Changes |
|------|---------|
| `try.html` | Added `window.BACKEND_URL` configuration |
| `dashboard.html` | Added `window.BACKEND_URL` configuration |
| `processing.html` | Added `window.BACKEND_URL` configuration |
| `results.html` | Added `window.BACKEND_URL` configuration |
| `backend/app.py` | Enhanced CORS configuration + startup logging |

## Next Steps

1. **Deploy Backend:**
   - Copy backend folder to production server
   - Install dependencies: `pip install -r requirements.txt`
   - Start with: `python run.py`

2. **Deploy Frontend:**
   - Copy HTML files and assets to web server
   - Configure web server to serve from DOCUGRAPH_WEBSITE directory

3. **Test Integration:**
   - Open `https://docugraph.site/try.html`
   - Upload a document and verify it processes correctly

4. **Monitor:**
   - Check backend logs for errors
   - Monitor API response times
   - Track user activity and issues

---

**Last Updated:** May 20, 2026
**Configuration Version:** 1.0
**DOCUGRAPH Version:** 6.0 (Phase 6: Python Backend)
