# DOCUGRAPH Backend - Phase 6: Python API Server

**Purpose**: Advanced document layout analysis and semantic embeddings  
**Status**: ✅ Production Ready  
**Version**: 6.0.0

---

## Quick Start

### Setup
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

### Run Locally
```bash
# Development mode
python app.py

# Production mode with Gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Docker
```bash
# Build and run
docker build -t docugraph-backend .
docker run -p 5000:5000 docugraph-backend

# Or use docker-compose (from parent directory)
cd ..
docker-compose up -d
```

---

## API Endpoints

### Health Check
```bash
curl http://localhost:5000/health
```

### Layout Analysis
```bash
curl -X POST -F "image=@document.jpg" \
  http://localhost:5000/api/v1/layout/analyze
```

### Semantic Embeddings
```bash
curl -X POST http://localhost:5000/api/v1/embeddings/generate \
  -H "Content-Type: application/json" \
  -d '{"text": "Sample text", "language": "en"}'
```

### Similarity
```bash
curl -X POST http://localhost:5000/api/v1/embeddings/similarity \
  -H "Content-Type: application/json" \
  -d '{"text1": "First", "text2": "Second"}'
```

---

## Configuration

**File**: `.env`

```
FLASK_ENV=production
DEBUG=False
PORT=5000
UPLOAD_FOLDER=./uploads
MAX_CONTENT_LENGTH=52428800
```

---

## Requirements

- Python 3.10+
- 8GB RAM minimum (16GB recommended)
- CUDA-capable GPU (recommended but optional)
- 4GB disk space for models

---

## Performance

| Operation | Time | GPU? |
|-----------|------|------|
| Layout Analysis | 500-1000ms | Recommended |
| Embedding | 100-200ms | Recommended |
| Health Check | <10ms | - |

---

## Support

See parent directory documentation:
- [PHASE_6_8_COMPLETE.md](../PHASE_6_8_COMPLETE.md)
- [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)
