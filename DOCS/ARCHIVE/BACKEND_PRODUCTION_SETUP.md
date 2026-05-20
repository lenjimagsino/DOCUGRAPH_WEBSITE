# DOCUGRAPH Backend - Production Setup Guide
## Keeping Your Backend Running 24/7

This guide ensures your DOCUGRAPH backend runs continuously without manual intervention.

---

## 📋 Table of Contents

1. [Features Verification](#features-verification)
2. [Windows Setup](#windows-setup)
3. [Linux/Ubuntu Setup](#linuxubuntu-setup)
4. [Health Monitoring](#health-monitoring)
5. [Troubleshooting](#troubleshooting)

---

## Features Verification

### ✅ All Advanced Features Are Enabled

Your DOCUGRAPH backend includes all these capabilities:

#### **Frontend (JavaScript-Based) - Running in Browser:**
- ✅ **Smart OCR Engine** - Tesseract.js with preprocessing
- ✅ **GNN Document Analyzer** - Graph Neural Network analysis
- ✅ **Document Segmentation** - Hierarchical layout segmentation
- ✅ **Multilingual Support** - 12+ languages with auto-detection
- ✅ **Shape Detection** - Flowchart and diagram recognition
- ✅ **Table Detection** - Grid and structure recognition
- ✅ **Advanced Preprocessing** - Contrast enhancement, binarization, morphological operations

#### **Backend (Python-Based) - Running on Server:**
- ✅ **LayoutParser + Detectron2** - Enterprise-grade document layout detection
- ✅ **EasyOCR** - High-accuracy text extraction
- ✅ **Semantic Embeddings** - Cross-lingual text understanding (XLM-R)
- ✅ **CORS Configuration** - Supports all your domains
- ✅ **Batch Processing** - Handle multiple documents efficiently
- ✅ **REST API** - Full backend API endpoints

#### **API Endpoints Available:**
```
✓ POST /api/v1/layout/analyze     - Layout detection
✓ POST /api/v1/ocr/extract        - Text extraction
✓ POST /api/v1/embeddings/generate - Generate embeddings
✓ POST /api/v1/embeddings/similarity - Compare texts
✓ POST /api/v1/batch/analyze      - Batch processing
✓ GET  /health                     - Health check
✓ GET  /diagnostics                - System diagnostics
```

---

## Windows Setup

### Option 1: Simple Batch Script (Recommended for Windows)

**Easiest Setup:**

1. Navigate to backend folder:
   ```
   cd C:\Users\mlenj\Music\DOCUGRAPH_WEBSITE\backend
   ```

2. Run the startup script:
   ```
   start_backend_windows.bat
   ```

This will start the backend with auto-restart on crashes.

### Option 2: Windows Task Scheduler (Advanced)

**Auto-start on Server Boot:**

1. Open Task Scheduler (press `Win+R`, type `taskschd.msc`)

2. Click "Create Basic Task" and fill in:
   - **Name:** DOCUGRAPH Backend
   - **Description:** Keeps DOCUGRAPH backend running 24/7
   - **Trigger:** At startup
   - **Action:** Start a program
   - **Program:** `C:\path\to\python.exe`
   - **Arguments:** `C:\Users\mlenj\Music\DOCUGRAPH_WEBSITE\backend\run_production.py`
   - **Start in:** `C:\Users\mlenj\Music\DOCUGRAPH_WEBSITE\backend`

3. In "Conditions" tab:
   - Uncheck "Start the task only if the computer is on AC power"
   - Check "Run the task as soon as possible after a scheduled start is missed"

4. In "Settings" tab:
   - Check "Run task as soon as possible if a scheduled start is missed"
   - Check "Restart the computer if it crashes"
   - Check "If the running task does not end when requested, force it to close"

5. Click OK and test:
   ```bash
   curl http://localhost:5000/health
   ```

### Option 3: NSSM (Non-Sucking Service Manager)

**Windows Service with Full Control:**

1. Download NSSM from: https://nssm.cc/download

2. Extract and add to PATH or navigate to folder

3. Install as service:
   ```
   nssm install DOCUGRAPH-Backend python C:\Users\mlenj\Music\DOCUGRAPH_WEBSITE\backend\run_production.py
   ```

4. Set working directory:
   ```
   nssm set DOCUGRAPH-Backend AppDirectory C:\Users\mlenj\Music\DOCUGRAPH_WEBSITE\backend
   ```

5. Start the service:
   ```
   nssm start DOCUGRAPH-Backend
   ```

6. Check status:
   ```
   nssm status DOCUGRAPH-Backend
   ```

---

## Linux/Ubuntu Setup

### Option 1: Systemd Service (Recommended for Linux)

**Automatic start on boot with auto-restart:**

1. Copy the service file:
   ```bash
   sudo cp docugraph-backend.service /etc/systemd/system/
   ```

2. Edit the service file to fix paths:
   ```bash
   sudo nano /etc/systemd/system/docugraph-backend.service
   ```
   
   Replace `/path/to/DOCUGRAPH_WEBSITE` with actual path:
   ```bash
   /home/yourusername/DOCUGRAPH_WEBSITE
   ```

3. Reload systemd:
   ```bash
   sudo systemctl daemon-reload
   ```

4. Enable and start:
   ```bash
   sudo systemctl enable docugraph-backend
   sudo systemctl start docugraph-backend
   ```

5. Check status:
   ```bash
   sudo systemctl status docugraph-backend
   ```

6. View logs:
   ```bash
   sudo journalctl -u docugraph-backend -f
   ```

### Option 2: Supervisor (Process Manager)

**For systems already using Supervisor:**

1. Copy supervisor config:
   ```bash
   sudo cp supervisor.conf /etc/supervisor/conf.d/docugraph-backend.conf
   ```

2. Edit paths:
   ```bash
   sudo nano /etc/supervisor/conf.d/docugraph-backend.conf
   ```

3. Reload supervisor:
   ```bash
   sudo supervisorctl reread
   sudo supervisorctl update
   ```

4. Start the backend:
   ```bash
   sudo supervisorctl start docugraph-backend
   ```

5. Check status:
   ```bash
   sudo supervisorctl status
   ```

### Option 3: Screen or Tmux

**Simple but manual session management:**

1. Start a screen session:
   ```bash
   screen -S docugraph-backend
   ```

2. Start the server:
   ```bash
   cd backend
   python run_production.py
   ```

3. Detach (Ctrl+A, then D)

4. Reattach later:
   ```bash
   screen -r docugraph-backend
   ```

### Option 4: Bash Script with While Loop

**Simple auto-restart script:**

1. Create script `start_backend.sh`:
   ```bash
   #!/bin/bash
   cd /path/to/DOCUGRAPH_WEBSITE/backend
   
   while true; do
       echo "Starting DOCUGRAPH backend..."
       python run_production.py
       echo "Backend crashed, restarting in 5 seconds..."
       sleep 5
   done
   ```

2. Make executable:
   ```bash
   chmod +x start_backend.sh
   ```

3. Run it:
   ```bash
   ./start_backend.sh
   ```

---

## Health Monitoring

### Check If Backend Is Running

#### From Command Line:
```bash
curl http://localhost:5000/health
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

#### From Browser:
1. Open: `http://localhost:5000/health`
2. Or: `http://docugraph.site:5000/health` (production)

### Check System Diagnostics

```bash
curl http://localhost:5000/diagnostics
```

This shows:
- Python version
- Installed packages
- Model status (LayoutParser, OCR, Embeddings)
- Recommendations for missing features

### Monitor Website Integration

1. Open your website: `https://docugraph.site/try.html`
2. Press F12 (Developer Tools)
3. Go to Console tab
4. Should show: `📡 Backend URL configured: https://docugraph.site:5000`
5. Upload a document
6. Check Network tab → ensure API calls to backend succeed

---

## Troubleshooting

### Backend Not Starting

**Error: "ModuleNotFoundError"**
```bash
pip install -r requirements.txt
```

**Error: "Address already in use"**
```bash
# Find process using port 5000
netstat -tulpn | grep 5000

# Kill the process
kill -9 <PID>
```

### Backend Running But Not Responding

1. Check if it's actually running:
   ```bash
   curl http://localhost:5000/health
   ```

2. Check firewall:
   ```bash
   sudo ufw allow 5000
   ```

3. Check logs (systemd):
   ```bash
   sudo journalctl -u docugraph-backend -n 50
   ```

4. Check logs (supervisor):
   ```bash
   tail -f /var/log/docugraph-backend.log
   ```

### Website Shows CORS Errors

1. Verify backend is running on correct port
2. Check `backend/app.py` has your domain in `cors_origins`
3. Hard refresh browser (Ctrl+Shift+R)
4. Check browser console for actual error message

### OCR Features Not Working

1. Check if EasyOCR is installed:
   ```bash
   python -c "import easyocr; print('OK')"
   ```

2. If not installed:
   ```bash
   pip install easyocr
   ```

3. Check diagnostics:
   ```bash
   curl http://localhost:5000/diagnostics
   ```

### High Memory/CPU Usage

**Limit resources in systemd service:**
```ini
MemoryLimit=2G
CPUQuota=80%
```

**Reduce worker count in `run_production.py`:**
```bash
WORKERS=2 python run_production.py
```

---

## Performance Settings

### Environment Variables

```bash
# Number of worker processes (default: 4)
export WORKERS=4

# Request timeout in seconds (default: 120)
export TIMEOUT=120

# Server port (default: 5000)
export PORT=5000

# Flask environment (development or production)
export FLASK_ENV=production
```

### For High-Traffic Sites

1. **Increase workers:**
   ```bash
   WORKERS=8 python run_production.py
   ```

2. **Use Nginx reverse proxy:**
   ```nginx
   upstream docugraph_backend {
       server 127.0.0.1:5000;
       server 127.0.0.1:5001;
       server 127.0.0.1:5002;
   }
   ```

3. **Enable caching:**
   - Add Redis for session caching
   - Cache API responses

---

## Summary

| Operating System | Recommended Method | Start Command |
|------------------|-------------------|----------------|
| Windows | Batch Script | `start_backend_windows.bat` |
| Windows (Advanced) | NSSM Service | `nssm install ...` |
| Ubuntu/Debian | Systemd | `sudo systemctl start ...` |
| Any Linux | Supervisor | `supervisorctl start ...` |
| Any (Simple) | Bash Loop | `./start_backend.sh` |

---

## Next Steps

1. ✅ **Choose your platform** (Windows/Linux)
2. ✅ **Follow the setup steps** for your platform
3. ✅ **Test the backend** with `curl http://localhost:5000/health`
4. ✅ **Test website integration** by uploading a document
5. ✅ **Monitor regularly** using health check endpoints

---

**Your backend is now production-ready and will run continuously! 🎉**

Questions? Check logs or run diagnostics endpoint.
