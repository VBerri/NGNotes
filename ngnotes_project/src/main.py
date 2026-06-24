#!/usr/bin/env python3
"""
NGNotes: Engineering Notes to Report Converter
Main entry point for the application
"""

import argparse
import os
import sys
import json

# Add src to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from converter import NGNotesConverter
from models import get_all_model_configs, get_default_model_config


def main():
    """Main entry point"""
    
    parser = argparse.ArgumentParser(
        description="NGNotes: Engineering Notes to Report Converter",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --input notes.txt --output summary.txt
  %(prog)s --input notes.txt --output summary.txt --model gpt-4
  %(prog)s --input notes.txt --output summary.txt --compare
        """
    )
    
    parser.add_argument(
        '--input',
        '-i',
        type=str,
        required=True,
        help='Input file containing engineering notes'
    )
    
    parser.add_argument(
        '--output',
        '-o',
        type=str,
        required=True,
        help='Output file for the generated summary'
    )
    
    parser.add_argument(
        '--model',
        '-m',
        type=str,
        default=None,
        help='Specific model to use (default: first available model)'
    )
    
    parser.add_argument(
        '--compare',
        action='store_true',
        help='Run parameter sweep and compare results from all models'
    )
    
    parser.add_argument(
        '--results-file',
        type=str,
        default=None,
        help='File to save comparison results (JSON format)'
    )
    
    args = parser.parse_args()
    
    # Validate input file exists
    if not os.path.exists(args.input):
        print(f"Error: Input file '{args.input}' does not exist.")
        sys.exit(1)
    
    # Initialize converter
    converter = NGNotesConverter()
    
    # Load engineering notes
    print("Loading engineering notes...")
    notes = converter.load_engineering_notes(args.input)
    if notes is None:
        print("Error: Failed to load engineering notes.")
        sys.exit(1)
    
    # Determine which model to use
    if args.model:
        # Use specified model
        model_config = converter.get_model_config(args.model)
        if model_config is None:
            print(f"Error: Model '{args.model}' not found.")
            sys.exit(1)
        print(f"Using specified model: {model_config}")
    else:
        # Use default model
        model_config = get_default_model_config()
        print(f"Using default model: {model_config}")
    
    if args.compare:
        # Run parameter sweep and compare results
        print("Running parameter sweep...")
        summaries = converter.run_parameter_sweep(notes)
        
        # Compare models
        comparison_results = converter.compare_models(summaries)
        
        # Save results
        if args.results_file:
            print(f"Saving comparison results to {args.results_file}")
            converter.save_results(comparison_results, args.results_file)
        
        # Display best result
        print("\n=== BEST RESULT ===")
        print(f"Best model: {comparison_results['best_model']}")
        print(f"Summary:\n{comparison_results['overall_best_summary']}")
        
        # Save the best summary to output file
        success = converter.save_summary(
            comparison_results['overall_best_summary'], 
            args.output
        )
        
        if success:
            print(f"\nSummary saved to {args.output}")
        else:
            print("Error: Failed to save summary.")
            
    else:
        # Generate single summary with specified model
        print("Generating summary...")
        result = converter.generate_summary(notes, model_config)
        
        # Save summary
        success = converter.save_summary(result.summary, args.output)
        
        if success:
            print(f"Summary saved to {args.output}")
        else:
            print("Error: Failed to save summary.")
    
    print("Done.")


if __name__ == "__main__":
    main()
