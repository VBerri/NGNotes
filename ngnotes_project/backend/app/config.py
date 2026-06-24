"""
NGNotes: Configuration settings
"""

from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    # LLM Runtime Endpoint (OpenAI-compatible API)
    VLLM_BASE_URL: str = "http://localhost:11434/v1"
    
    # API Key (Ollama doesn't need one, use "EMPTY")
    VLLM_API_KEY: str = "EMPTY"
    
    # Comma-separated list of models to expose in /api/default-models
    DEFAULT_MODELS: str = "llama3.2:1b,llama3.2:latest,qwen2.5:0.5b,qwen2.5:1.5b,qwen2.5:3b,phi3:mini"
    
    # Request timeout in seconds
    DEFAULT_TIMEOUT_SECONDS: int = 120
    
    # Embedding model for semantic similarity
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    
    # API Host and Port
    HOST: str = "0.0.0.0"
    PORT: int = 8010

    # ── Vision routing ────────────────────────────────────────────────────────
    # When a Run-Mode request includes an image and the selected text model is
    # NOT vision-capable, the backend proxies the image through one of these
    # vision-capable models and uses its description as extra context.
    # Heuristic picks DOCUMENT model for screenshots/diagrams/dense text, and
    # NATURAL model for photos / general visual content. Override in .env if
    # you have different vision-capable models pulled locally.
    VISION_MODEL_DOCUMENT: str = "qwen3.6:latest"
    VISION_MODEL_NATURAL: str = "gemma4:latest"
    # Hard cap on uploaded image size (bytes). 20 MB by default.
    MAX_IMAGE_BYTES: int = 20 * 1024 * 1024

    class Config:
        env_file = ".env"

# Initialize settings
settings = Settings()