#!/usr/bin/env python3
"""
Integration test for NGNotes converter
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from converter import NGNotesConverter

def test_converter_functionality():
    """Test that the converter works end-to-end"""
    
    # Create a simple test note
    test_notes = "This is a test engineering note about implementing a new feature. The feature should be well documented and tested."
    
    # Initialize converter
    converter = NGNotesConverter()
    
    # Test loading notes
    print("Testing note loading...")
    loaded_notes = converter.load_engineering_notes('test_notes.txt')
    if loaded_notes is None:
        # If file doesn't exist, create it
        with open('test_notes.txt', 'w') as f:
            f.write(test_notes)
        loaded_notes = converter.load_engineering_notes('test_notes.txt')
    
    assert loaded_notes is not None, "Failed to load notes"
    print("✓ Note loading works")
    
    # Test model configuration retrieval
    print("Testing model config retrieval...")
    config = converter.get_model_config("gpt-3.5-turbo")
    assert config is not None, "Failed to get model config"
    print("✓ Model config retrieval works")
    
    # Test summary generation
    print("Testing summary generation...")
    result = converter.generate_summary(test_notes, config)
    assert result is not None, "Failed to generate summary"
    assert result.summary is not None, "Summary is empty"
    assert result.evaluation is not None, "Evaluation is missing"
    print("✓ Summary generation works")
    
    # Test parameter sweep
    print("Testing parameter sweep...")
    results = converter.run_parameter_sweep(test_notes)
    assert isinstance(results, dict), "Parameter sweep should return a dictionary"
    assert len(results) > 0, "Should have results from parameter sweep"
    print("✓ Parameter sweep works")
    
    # Test comparison
    print("Testing model comparison...")
    comparison = converter.compare_models(results)
    assert 'best_model' in comparison, "Comparison should have best model"
    assert 'overall_best_summary' in comparison, "Comparison should have best summary"
    print("✓ Model comparison works")
    
    # Test saving functionality
    print("Testing save functionality...")
    success = converter.save_summary(result.summary, 'test_output.txt')
    assert success, "Failed to save summary"
    
    success = converter.save_results(comparison, 'test_results.json')
    assert success, "Failed to save results"
    print("✓ Save functionality works")
    
    # Clean up
    try:
        os.remove('test_notes.txt')
        os.remove('test_output.txt')
        os.remove('test_results.json')
    except:
        pass
    
    print("\n🎉 All tests passed! The NGNotes converter is working correctly.")

if __name__ == "__main__":
    test_converter_functionality()