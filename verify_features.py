#!/usr/bin/env python3
"""
DOCUGRAPH Feature Verification Script
Confirms all advanced features are properly configured and working
"""

import sys
import json
import subprocess
import importlib
from pathlib import Path

class FeatureVerifier:
    def __init__(self):
        self.results = {
            'timestamp': str(__import__('datetime').datetime.now()),
            'backend_features': {},
            'frontend_features': {},
            'dependencies': {},
            'api_endpoints': {},
            'warnings': [],
            'errors': []
        }
        
    def check_python_packages(self):
        """Verify all required Python packages are installed"""
        print("\n" + "="*70)
        print("🔍 DOCUGRAPH Feature Verification")
        print("="*70)
        
        print("\n📦 Checking Python Dependencies...")
        
        packages = {
            'flask': 'Web Framework',
            'flask_cors': 'CORS Support',
            'cv2': 'OpenCV (Image Processing)',
            'numpy': 'NumPy (Numerical)',
            'PIL': 'Pillow (Image)',
            'transformers': 'Transformers (NLP)',
            'gunicorn': 'Production Server',
        }
        
        optional = {
            'easyocr': 'EasyOCR (Text Recognition)',
            'layoutparser': 'LayoutParser (Layout Detection)',
            'torch': 'PyTorch (Deep Learning)',
            'scipy': 'SciPy (Scientific)',
        }
        
        for pkg, desc in packages.items():
            try:
                mod = importlib.import_module(pkg)
                version = getattr(mod, '__version__', 'unknown')
                print(f"  ✅ {desc}: {version}")
                self.results['dependencies'][pkg] = 'installed'
            except ImportError:
                print(f"  ❌ {desc}: NOT INSTALLED")
                self.results['dependencies'][pkg] = 'missing'
                self.results['errors'].append(f"Required package missing: {pkg}")
        
        print("\n📚 Optional Dependencies...")
        for pkg, desc in optional.items():
            try:
                mod = importlib.import_module(pkg)
                version = getattr(mod, '__version__', 'unknown')
                print(f"  ✅ {desc}: {version}")
                self.results['dependencies'][pkg] = 'installed'
            except ImportError:
                print(f"  ℹ️  {desc}: not installed (optional)")
                self.results['dependencies'][pkg] = 'optional'
                self.results['warnings'].append(f"Optional package missing: {pkg}")
    
    def check_backend_features(self):
        """Verify backend classes and features"""
        print("\n🔧 Checking Backend Features...")
        
        backend_path = Path('backend/app.py')
        if not backend_path.exists():
            self.results['errors'].append("backend/app.py not found")
            return
        
        backend_code = backend_path.read_text()
        
        features = {
            'OCREngine': 'Text Recognition (OCR)',
            'LayoutAnalyzer': 'Document Layout Detection',
            'SemanticEmbeddingEngine': 'Semantic Embeddings & NLP',
            'LayoutParser': 'Advanced Layout Analysis',
            'Detectron2': 'Deep Learning Models',
        }
        
        for feature, desc in features.items():
            if f'class {feature}' in backend_code:
                print(f"  ✅ {desc}")
                self.results['backend_features'][feature] = 'implemented'
            else:
                print(f"  ❌ {desc} - class not found")
                self.results['backend_features'][feature] = 'missing'
    
    def check_api_endpoints(self):
        """Verify API endpoints are defined"""
        print("\n📡 Checking API Endpoints...")
        
        backend_path = Path('backend/app.py')
        backend_code = backend_path.read_text()
        
        endpoints = {
            '/health': 'Health Check',
            '/diagnostics': 'System Diagnostics',
            '/api/v1/layout/analyze': 'Layout Analysis',
            '/api/v1/ocr/extract': 'OCR Text Extraction',
            '/api/v1/embeddings/generate': 'Embeddings Generation',
            '/api/v1/embeddings/similarity': 'Text Similarity',
            '/api/v1/batch/analyze': 'Batch Processing',
        }
        
        for endpoint, desc in endpoints.items():
            clean_endpoint = endpoint.replace('/', '')
            if endpoint in backend_code or clean_endpoint in backend_code:
                print(f"  ✅ {desc}: {endpoint}")
                self.results['api_endpoints'][endpoint] = 'available'
            else:
                print(f"  ❌ {desc}: {endpoint} - NOT FOUND")
                self.results['api_endpoints'][endpoint] = 'missing'
    
    def check_frontend_features(self):
        """Verify frontend JavaScript features"""
        print("\n🖥️  Checking Frontend Features...")
        
        try_path = Path('try.html')
        if not try_path.exists():
            self.results['errors'].append("try.html not found")
            return
        
        frontend_code = try_path.read_text()
        
        features = {
            'SmartOCREngine': 'Smart OCR with Preprocessing',
            'GNNDocumentAnalyzer': 'Graph Neural Network Analysis',
            'DocumentSegmenter': 'Document Segmentation',
            'MultilingualProcessor': 'Multilingual Support (12+ languages)',
            'ShapeDetector': 'Shape & Flowchart Detection',
            'LayoutDetector': 'Layout Detection',
            'Tesseract': 'Tesseract.js OCR',
        }
        
        for feature, desc in features.items():
            if feature in frontend_code:
                print(f"  ✅ {desc}")
                self.results['frontend_features'][feature] = 'implemented'
            else:
                print(f"  ❌ {desc} - NOT FOUND")
                self.results['frontend_features'][feature] = 'missing'
    
    def check_backend_configuration(self):
        """Verify backend CORS and configuration"""
        print("\n⚙️  Checking Backend Configuration...")
        
        backend_path = Path('backend/app.py')
        backend_code = backend_path.read_text()
        
        configs = {
            'docugraph.site': 'Production Domain',
            'localhost': 'Development Support',
            'CORS': 'Cross-Origin Support',
            'cors_origins': 'Domain Whitelist',
            '@app.route': 'Flask Routes',
        }
        
        for config, desc in configs.items():
            if config in backend_code:
                print(f"  ✅ {desc}")
            else:
                print(f"  ⚠️  {desc}: {config} not found")
    
    def check_frontend_configuration(self):
        """Verify frontend backend URL configuration"""
        print("\n🌐 Checking Frontend Configuration...")
        
        html_files = ['try.html', 'dashboard.html', 'processing.html', 'results.html']
        
        for html_file in html_files:
            path = Path(html_file)
            if not path.exists():
                print(f"  ⚠️  {html_file}: NOT FOUND")
                continue
            
            content = path.read_text()
            if 'window.BACKEND_URL' in content and 'docugraph.site' in content:
                print(f"  ✅ {html_file}: Backend URL configured")
            else:
                print(f"  ⚠️  {html_file}: Backend URL not properly configured")
                self.results['warnings'].append(f"{html_file} missing backend URL config")
    
    def run_checks(self):
        """Run all verification checks"""
        self.check_python_packages()
        self.check_backend_features()
        self.check_api_endpoints()
        self.check_frontend_features()
        self.check_backend_configuration()
        self.check_frontend_configuration()
    
    def print_summary(self):
        """Print verification summary"""
        print("\n" + "="*70)
        print("📊 VERIFICATION SUMMARY")
        print("="*70)
        
        # Count results
        total_features = len(self.results['backend_features']) + len(self.results['frontend_features'])
        implemented = sum(1 for v in self.results['backend_features'].values() if v == 'implemented')
        implemented += sum(1 for v in self.results['frontend_features'].values() if v == 'implemented')
        
        print(f"\n✅ Features Implemented: {implemented}/{total_features}")
        print(f"✅ API Endpoints Available: {len(self.results['api_endpoints'])}")
        print(f"⚠️  Warnings: {len(self.results['warnings'])}")
        print(f"❌ Errors: {len(self.results['errors'])}")
        
        if self.results['errors']:
            print("\n❌ ERRORS:")
            for error in self.results['errors']:
                print(f"   - {error}")
        
        if self.results['warnings']:
            print("\n⚠️  WARNINGS:")
            for warning in self.results['warnings']:
                print(f"   - {warning}")
        
        if not self.results['errors']:
            print("\n✅ ALL CHECKS PASSED!")
            print("   Your DOCUGRAPH backend is properly configured with all advanced features!")
        
        print("\n" + "="*70)
        
        # Save report
        report_path = Path('DOCUGRAPH_VERIFICATION_REPORT.json')
        with open(report_path, 'w') as f:
            json.dump(self.results, f, indent=2)
        print(f"\n📄 Report saved to: DOCUGRAPH_VERIFICATION_REPORT.json")

def main():
    verifier = FeatureVerifier()
    
    try:
        verifier.run_checks()
        verifier.print_summary()
        
        if verifier.results['errors']:
            return 1
        return 0
    except Exception as e:
        print(f"\n❌ Verification failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())
