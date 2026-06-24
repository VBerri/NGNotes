"""
NGNotes: Engineering Notes to Report Converter
Package initialization file
"""

__version__ = "1.0.0"
__author__ = "Engineering Team"

from .converter import NGNotesConverter
from .models import ModelConfig, EvaluationResult
from .evaluation import evaluate_summary

__all__ = [
    'NGNotesConverter',
    'ModelConfig', 
    'EvaluationResult',
    'evaluate_summary'
]
