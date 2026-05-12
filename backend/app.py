"""
DOCUGRAPH Phase 6: Python Backend API Server
Enterprise-grade document analysis with LayoutParser and Detectron2
"""

import os
import json
import base64
from io import BytesIO
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import cv2
import numpy as np
from PIL import Image
from transformers import AutoTokenizer, AutoModel

# Optional imports with graceful fallback
try:
    import layoutparser as lp
    HAS_LAYOUTPARSER = True
except ImportError:
    HAS_LAYOUTPARSER = False
    print("⚠ Warning: layoutparser not installed. Using fallback layout analysis.")

try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    print("⚠ Warning: PyTorch not installed. Using CPU mode.")

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', './uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ===========================
# Phase 6: LayoutParser Integration
# ===========================

class LayoutAnalyzer:
    """Advanced layout analysis using LayoutParser + Detectron2"""
    
    def __init__(self):
        """Initialize LayoutParser models"""
        if not HAS_LAYOUTPARSER:
            print("ℹ LayoutParser not available. Using fallback layout analysis.")
            self.initialized = False
            self.model = None
            return
            
        try:
            # PubLayNet model for document layout detection
            self.model = lp.Detectron2LayoutModel(
                config_path="lp://PubLayNet/faster_rcnn_ResNest50_fpn_3x",
                model_path="lp://PubLayNet/faster_rcnn_ResNest50_fpn_3x/model_final.pth",
                extra_config=["MODEL.ROI_HEADS.SCORE_THRESH_TEST", 0.5],
                label_map={0: "Text", 1: "Title", 2: "List", 3: "Table", 4: "Figure"}
            )
            self.initialized = True
            print("✓ LayoutParser model loaded")
        except Exception as e:
            print(f"⚠ LayoutParser initialization failed: {e}")
            print("  Using fallback layout analysis instead")
            self.initialized = False
            self.model = None
    
    def analyze_layout(self, image_array):
        """
        Analyze document layout using LayoutParser
        
        Args:
            image_array: numpy array (H×W×C)
        
        Returns:
            dict with layout blocks, hierarchy, and confidence scores
        """
        if not self.initialized or self.model is None:
            return self._fallback_layout_analysis(image_array)
        
        try:
            # Convert to PIL Image for LayoutParser
            if isinstance(image_array, np.ndarray):
                image = Image.fromarray(image_array.astype('uint8'))
            else:
                image = image_array
            
            # Run detection
            layout = self.model.detect(image)
            
            # Extract blocks with hierarchy
            blocks = []
            for block in layout:
                block_info = {
                    'type': block.type,
                    'bbox': [block.x_1, block.y_1, block.x_2, block.y_2],
                    'confidence': float(block.score) if hasattr(block, 'score') else 0.95,
                    'text': block.text if hasattr(block, 'text') else None,
                    'category': self._categorize_block(block.type)
                }
                blocks.append(block_info)
            
            # Build hierarchy (reading order)
            hierarchy = self._build_hierarchy(blocks, image_array.shape)
            
            return {
                'success': True,
                'blocks': blocks,
                'hierarchy': hierarchy,
                'page_info': {
                    'width': image_array.shape[1],
                    'height': image_array.shape[0],
                    'block_count': len(blocks)
                }
            }
        
        except Exception as e:
            print(f"Layout analysis error: {e}")
            return self._fallback_layout_analysis(image_array)
    
    def _fallback_layout_analysis(self, image_array):
        """Fallback to basic layout analysis"""
        height, width = image_array.shape[:2]
        
        # Basic grid-based layout detection
        blocks = [
            {
                'type': 'Text',
                'bbox': [0, 0, width, height],
                'confidence': 0.7,
                'category': 'paragraph'
            }
        ]
        
        return {
            'success': True,
            'blocks': blocks,
            'hierarchy': blocks,
            'page_info': {
                'width': width,
                'height': height,
                'block_count': 1
            }
        }
    
    def _categorize_block(self, block_type):
        """Map LayoutParser types to DOCUGRAPH categories"""
        mapping = {
            'Text': 'paragraph',
            'Title': 'header',
            'List': 'list',
            'Table': 'table',
            'Figure': 'figure'
        }
        return mapping.get(block_type, 'paragraph')
    
    def _build_hierarchy(self, blocks, image_shape):
        """Build reading order hierarchy"""
        # Sort by position (top-to-bottom, left-to-right)
        sorted_blocks = sorted(blocks, key=lambda b: (b['bbox'][1], b['bbox'][0]))
        
        # Add reading order
        for idx, block in enumerate(sorted_blocks):
            block['reading_order'] = idx
        
        return sorted_blocks


class SemanticEmbeddingEngine:
    """Cross-lingual semantic embedding generation"""
    
    def __init__(self):
        """Initialize embedding model"""
        try:
            self.model_name = "sentence-transformers/xlm-r-large-v1"
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModel.from_pretrained(self.model_name)
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            self.model.to(self.device)
            self.model.eval()
            print("✓ Semantic embedding model loaded")
        except Exception as e:
            print(f"⚠ Embedding model initialization failed: {e}")
            self.model = None
    
    def get_embedding(self, text, language='en'):
        """Generate 768-dimensional semantic embedding"""
        if self.model is None:
            return [0.0] * 768
        
        try:
            with torch.no_grad():
                inputs = self.tokenizer(
                    text,
                    return_tensors='pt',
                    padding=True,
                    truncation=True,
                    max_length=512
                )
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
                
                outputs = self.model(**inputs)
                embeddings = outputs.last_hidden_state.mean(dim=1)
                
                return embeddings[0].cpu().tolist()
        except Exception as e:
            print(f"Embedding error: {e}")
            return [0.0] * 768
    
    def compute_similarity(self, text1, text2):
        """Compute cosine similarity between two texts"""
        emb1 = np.array(self.get_embedding(text1))
        emb2 = np.array(self.get_embedding(text2))
        
        similarity = np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2) + 1e-8)
        return float(similarity)


# ===========================
# API Endpoints
# ===========================

# Initialize models
layout_analyzer = LayoutAnalyzer()
embedding_engine = SemanticEmbeddingEngine()

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'version': '6.0.0',
        'phase': 'Phase 6: Python Backend',
        'models': {
            'layoutparser': layout_analyzer.initialized,
            'embeddings': embedding_engine.model is not None
        }
    })


@app.route('/api/v1/layout/analyze', methods=['POST'])
def analyze_layout():
    """Analyze document layout using LayoutParser"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image provided'}), 400
        
        image_file = request.files['image']
        
        # Read image
        image_bytes = image_file.read()
        image_array = cv2.imdecode(
            np.frombuffer(image_bytes, np.uint8),
            cv2.IMREAD_COLOR
        )
        
        if image_array is None:
            return jsonify({'error': 'Invalid image'}), 400
        
        # Analyze layout
        result = layout_analyzer.analyze_layout(image_array)
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/embeddings/generate', methods=['POST'])
def generate_embeddings():
    """Generate semantic embeddings for text"""
    try:
        data = request.json
        text = data.get('text', '')
        language = data.get('language', 'en')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        embedding = embedding_engine.get_embedding(text, language)
        
        return jsonify({
            'text': text,
            'language': language,
            'embedding': embedding,
            'dimension': len(embedding)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/embeddings/similarity', methods=['POST'])
def compute_similarity():
    """Compute semantic similarity between two texts"""
    try:
        data = request.json
        text1 = data.get('text1', '')
        text2 = data.get('text2', '')
        
        if not text1 or not text2:
            return jsonify({'error': 'Both texts required'}), 400
        
        similarity = embedding_engine.compute_similarity(text1, text2)
        
        return jsonify({
            'text1': text1,
            'text2': text2,
            'similarity': similarity,
            'interpretation': 'high' if similarity > 0.7 else ('medium' if similarity > 0.4 else 'low')
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/batch/analyze', methods=['POST'])
def batch_analyze():
    """Batch process multiple documents"""
    try:
        data = request.json
        documents = data.get('documents', [])
        
        if not documents:
            return jsonify({'error': 'No documents provided'}), 400
        
        results = []
        for doc in documents:
            result = {
                'id': doc.get('id'),
                'layout': layout_analyzer.analyze_layout(np.frombuffer(base64.b64decode(doc['image']), dtype=np.uint8).reshape(doc['height'], doc['width'], 3)),
                'embedding': embedding_engine.get_embedding(doc.get('text', ''))
            }
            results.append(result)
        
        return jsonify({
            'success': True,
            'processed': len(results),
            'results': results
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def server_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'False') == 'True'
    app.run(host='0.0.0.0', port=port, debug=debug)
