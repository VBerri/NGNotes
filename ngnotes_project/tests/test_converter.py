"""
Unit tests for the NGNotes converter
"""

import unittest
import os
import sys

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from converter import NGNotesConverter
from models import get_all_model_configs


class TestNGNotesConverter(unittest.TestCase):
    """Test cases for the NGNotes converter"""
    
    def setUp(self):
        """Set up test fixtures before each test method."""
        self.converter = NGNotesConverter()
        self.test_notes = "This is a test engineering note. It contains some information that should be summarized. The notes are about a software development project where we're implementing new features and fixing bugs. We need to document our progress and decisions for future reference."
    
    def test_load_engineering_notes(self):
        """Test loading engineering notes from file"""
        # Create a temporary file for testing
        with open('test_notes.txt', 'w') as f:
            f.write(self.test_notes)
        
        notes = self.converter.load_engineering_notes('test_notes.txt')
        self.assertEqual(notes, self.test_notes)
        
        # Clean up
        os.remove('test_notes.txt')
    
    def test_get_model_config(self):
        """Test getting model configuration by name"""
        config = self.converter.get_model_config("gpt-3.5-turbo")
        self.assertIsNotNone(config)
        self.assertEqual(config.name, "gpt-3.5-turbo")
        
        # Test with non-existent model
        config = self.converter.get_model_config("non-existent-model")
        self.assertIsNone(config)
    
    def test_get_all_model_configs(self):
        """Test getting all model configurations"""
        configs = get_all_model_configs()
        self.assertIsInstance(configs, list)
        self.assertGreater(len(configs), 0)
        
        # Check that we have at least the expected models
        model_names = [config.name for config in configs]
        self.assertIn("gpt-3.5-turbo", model_names)
        self.assertIn("gpt-4", model_names)
        self.assertIn("claude-2", model_names)
        self.assertIn("llama-2-7b", model_names)
    
    def test_generate_summary(self):
        """Test generating a summary"""
        # Test with a simple note
        config = self.converter.get_model_config("gpt-3.5-turbo")
        result = self.converter.generate_summary(self.test_notes, config)
        
        self.assertIsNotNone(result.summary)
        self.assertEqual(result.model_config, config)
        self.assertIsNotNone(result.evaluation)
        self.assertIsInstance(result.evaluation.rouge_l_f1, float)
        self.assertIsInstance(result.evaluation.semantic_similarity, float)
    
    def test_run_parameter_sweep(self):
        """Test running parameter sweep"""
        results = self.converter.run_parameter_sweep(self.test_notes)
        
        self.assertIsInstance(results, dict)
        self.assertGreater(len(results), 0)
        
        # Check that we have results for all models
        configs = get_all_model_configs()
        model_names = [config.name for config in configs]
        
        for model_name in model_names:
            self.assertIn(model_name, results)
            self.assertIsNotNone(results[model_name].summary)
            self.assertIsNotNone(results[model_name].evaluation)
    
    def test_save_summary(self):
        """Test saving summary to file"""
        # Create a test summary
        config = self.converter.get_model_config("gpt-3.5-turbo")
        result = self.converter.generate_summary(self.test_notes, config)
        
        # Save the summary
        success = self.converter.save_summary(result.summary, 'test_output.txt')
        self.assertTrue(success)
        
        # Verify file was created and contains correct content
        with open('test_output.txt', 'r') as f:
            content = f.read()
            self.assertEqual(content, result.summary)
        
        # Clean up
        os.remove('test_output.txt')
    
    def test_save_results(self):
        """Test saving results to JSON file"""
        # Run parameter sweep first
        results = self.converter.run_parameter_sweep(self.test_notes)
        
        # Compare models
        comparison_results = self.converter.compare_models(results)
        
        # Save the results
        success = self.converter.save_results(comparison_results, 'test_results.json')
        self.assertTrue(success)
        
        # Verify file was created and contains correct content
        with open('test_results.json', 'r') as f:
            saved_results = f.read()
            self.assertIn('best_model', saved_results)
            self.assertIn('overall_best_summary', saved_results)
        
        # Clean up
        os.remove('test_results.json')


if __name__ == '__main__':
    unittest.main()
        
        # Check that we have expected models
        model_names = [config.name for config in configs]
        self.assertIn("gpt-3.5-turbo", model_names)
        self.assertIn("gpt-4", model_names)
        self.assertIn("claude-2", model_names)
        self.assertIn("llama-2-7b", model_names)
    
    def test_run_parameter_sweep(self):
        """Test running parameter sweep"""
        summaries = self.converter.run_parameter_sweep(self.test_notes)
        self.assertIsInstance(summaries, dict)
        self.assertGreater(len(summaries), 0)
        
        # Check that all models are represented
        configs = get_all_model_configs()
        model_names = [config.name for config in configs]
        for name in model_names:
            self.assertIn(name, summaries)


if __name__ == '__main__':
    unittest.main()
