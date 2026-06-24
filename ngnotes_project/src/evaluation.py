"""
NGNotes: Engineering Notes to Report Converter
Evaluation logic for generated summaries
"""

import time
from typing import Dict, List
from dataclasses import dataclass

from models import EvaluationResult


def evaluate_summary(original_notes: str, summary: str) -> EvaluationResult:
    """
    Evaluate the quality of a generated summary
    
    Args:
        original_notes (str): Original engineering notes
        summary (str): Generated summary
        
    Returns:
        EvaluationResult: Evaluation metrics
    """
    
    # In a real implementation, this would use actual evaluation methods:
    # - ROUGE-L F1 score (measures overlap between generated and reference text)
    # - Semantic similarity metrics (using embeddings or other NLP techniques)
    # - Other NLP evaluation techniques
    
    # For demonstration purposes, we'll compute some simulated metrics
    # In practice, you would use libraries like:
    # - rouge-score for ROUGE metrics
    # - sentence-transformers for semantic similarity
    
    # Simulate processing time
    time.sleep(0.2)
    
    # Compute simulated evaluation metrics
    # These are simplified calculations for demonstration purposes
    
    # ROUGE-L F1 score (range: 0-1, higher is better)
    # We'll simulate this based on text overlap and length
    original_words = set(original_notes.lower().split())
    summary_words = set(summary.lower().split())
    
    if len(original_words) == 0:
        rouge_l_f1 = 0.0
    else:
        # Calculate intersection over union for word overlap
        intersection = len(original_words.intersection(summary_words))
        union = len(original_words.union(summary_words))
        rouge_l_f1 = intersection / union if union > 0 else 0.0
    
    # Semantic similarity (range: 0-1, higher is better)
    # This would typically be computed using embeddings
    semantic_similarity = rouge_l_f1 * 0.8 + 0.2  # Simplified relationship
    
    return EvaluationResult(
        rouge_l_f1=rouge_l_f1,
        semantic_similarity=semantic_similarity
    )


def compare_summaries(original_notes: str, summaries: Dict[str, str]) -> Dict:
    """
    Compare multiple summaries and determine the best one
    
    Args:
        original_notes (str): Original engineering notes
        summaries (Dict[str, str]): Dictionary of model_name -> summary
        
    Returns:
        Dict: Comparison results including best summary
    """
    
    # Compute evaluation metrics for each summary
    evaluation_results = {}
    
    for model_name, summary in summaries.items():
        # Evaluate each summary
        eval_result = evaluate_summary(original_notes, summary)
        evaluation_results[model_name] = {
            'evaluation': eval_result,
            'summary_length': len(summary)
        }
    
    # Determine best summary based on combined score (average of ROUGE-L F1 and semantic similarity)
    best_model = None
    best_score = -1
    
    for model_name, result in evaluation_results.items():
        # Calculate a combined score
        combined_score = (result['evaluation'].rouge_l_f1 + result['evaluation'].semantic_similarity) / 2
        
        if combined_score > best_score:
            best_score = combined_score
            best_model = model_name
    
    return {
        'best_model': best_model,
        'evaluation_results': evaluation_results,
        'overall_best_summary': summaries[best_model]
    }


def get_best_summary(summaries: Dict[str, str], original_notes: str) -> str:
    """
    Get the best summary based on evaluation metrics
    
    Args:
        summaries (Dict[str, str]): Dictionary of model_name -> summary
        original_notes (str): Original engineering notes
        
    Returns:
        str: Best summary text
    """
    
    # Find the summary with the highest combined evaluation score
    if not summaries:
        return ""
    
    best_summary = None
    best_score = -1
    
    for summary in summaries.values():
        eval_result = evaluate_summary(original_notes, summary)
        combined_score = (eval_result.rouge_l_f1 + eval_result.semantic_similarity) / 2
        
        if combined_score > best_score:
            best_score = combined_score
            best_summary = summary
            
    return best_summary if best_summary else ""
