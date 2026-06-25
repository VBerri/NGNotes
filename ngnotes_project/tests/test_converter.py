
import os
import sys
import unittest

# Add project root to path for package imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.converter import NGNotesConverter
from src.models import get_all_model_configs


class TestNGNotesConverter(unittest.TestCase):
    """Test cases for the NGNotes converter."""

    def setUp(self):
        self.converter = NGNotesConverter()
        self.test_notes = (
            "This is a test note with enough detail to be summarized. "
            "It describes a software project with features, bugs, and decisions."
        )

    def test_load_engineering_notes(self):
        with open("test_notes.txt", "w") as f:
            f.write(self.test_notes)

        notes = self.converter.load_engineering_notes("test_notes.txt")
        self.assertEqual(notes, self.test_notes)
        os.remove("test_notes.txt")

    def test_get_model_config(self):
        config = self.converter.get_model_config("gpt-3.5-turbo")
        self.assertIsNotNone(config)
        self.assertEqual(config.name, "gpt-3.5-turbo")

        missing = self.converter.get_model_config("non-existent-model")
        self.assertIsNone(missing)

    def test_get_all_model_configs(self):
        configs = get_all_model_configs()
        self.assertIsInstance(configs, list)
        self.assertGreater(len(configs), 0)

        model_names = [config.name for config in configs]
        self.assertIn("gpt-3.5-turbo", model_names)
        self.assertIn("gpt-4", model_names)
        self.assertIn("claude-2", model_names)
        self.assertIn("llama-2-7b", model_names)

    def test_generate_summary(self):
        config = self.converter.get_model_config("gpt-3.5-turbo")
        result = self.converter.generate_summary(self.test_notes, config)

        self.assertIsNotNone(result.summary)
        self.assertEqual(result.model_config, config)
        self.assertIsNotNone(result.evaluation)
        self.assertIsInstance(result.evaluation.rouge_l_f1, float)
        self.assertIsInstance(result.evaluation.semantic_similarity, float)

    def test_run_parameter_sweep(self):
        results = self.converter.run_parameter_sweep(self.test_notes)
        self.assertIsInstance(results, dict)
        self.assertGreater(len(results), 0)

        model_names = [config.name for config in get_all_model_configs()]
        for name in model_names:
            self.assertIn(name, results)
            self.assertIsNotNone(results[name].summary)
            self.assertIsNotNone(results[name].evaluation)

    def test_save_summary(self):
        config = self.converter.get_model_config("gpt-3.5-turbo")
        result = self.converter.generate_summary(self.test_notes, config)

        success = self.converter.save_summary(result.summary, "test_output.txt")
        self.assertTrue(success)

        with open("test_output.txt", "r") as f:
            self.assertEqual(f.read(), result.summary)
        os.remove("test_output.txt")

    def test_save_results(self):
        results = self.converter.run_parameter_sweep(self.test_notes)
        comparison = self.converter.compare_models(results)

        success = self.converter.save_results(comparison, "test_results.json")
        self.assertTrue(success)

        with open("test_results.json", "r") as f:
            payload = f.read()
            self.assertIn("best_model", payload)
            self.assertIn("overall_best_summary", payload)
        os.remove("test_results.json")


if __name__ == "__main__":
    unittest.main()
