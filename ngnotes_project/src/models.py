"""
NGNotes: Engineering Notes to Report Converter
Model configurations and data structures
"""

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class ModelConfig:
    """Configuration for a language model"""
    name: str
    provider: str
    max_tokens: int
    temperature: float
    top_p: float
    frequency_penalty: float
    presence_penalty: float
    
    def __str__(self) -> str:
        return f"{self.provider}/{self.name}"


@dataclass
class EvaluationResult:
    """Evaluation results for a summary"""
    rouge_l_f1: float
    semantic_similarity: float
    
    def to_dict(self) -> dict:
        """Convert evaluation result to dictionary"""
        return {
            'rouge_l_f1': self.rouge_l_f1,
            'semantic_similarity': self.semantic_similarity
        }


def get_all_model_configs() -> List[ModelConfig]:
    """
    Get all available model configurations
    
    Returns:
        List[ModelConfig]: List of all model configurations
    """
    return [
        ModelConfig(
            name="gpt-3.5-turbo",
            provider="openai",
            max_tokens=1000,
            temperature=0.7,
            top_p=1.0,
            frequency_penalty=0.0,
            presence_penalty=0.0
        ),
        ModelConfig(
            name="gpt-4",
            provider="openai",
            max_tokens=2000,
            temperature=0.5,
            top_p=1.0,
            frequency_penalty=0.0,
            presence_penalty=0.0
        ),
        ModelConfig(
            name="claude-2",
            provider="anthropic",
            max_tokens=1000,
            temperature=0.7,
            top_p=1.0,
            frequency_penalty=0.0,
            presence_penalty=0.0
        ),
        ModelConfig(
            name="llama-2-7b",
            provider="huggingface",
            max_tokens=1000,
            temperature=0.7,
            top_p=1.0,
            frequency_penalty=0.0,
            presence_penalty=0.0
        )
    ]


def get_default_model_config() -> ModelConfig:
    """
    Get the default model configuration
    
    Returns:
        ModelConfig: Default model configuration
    """
    configs = get_all_model_configs()
    return configs[0]  # Return first available model as default


def get_model_config_by_name(name: str) -> Optional[ModelConfig]:
    """
    Get a specific model configuration by name
    
    Args:
        name (str): Name of the model
        
    Returns:
        Optional[ModelConfig]: Model configuration or None if not found
    """
    configs = get_all_model_configs()
    for config in configs:
        if config.name == name:
            return config
    return None
