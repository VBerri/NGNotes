#!/usr/bin/env python3
"""
Example usage of NGNotes converter
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from converter import NGNotesConverter

def main():
    # Create sample notes
    sample_notes = """
Engineering Notes - Project Alpha
    
1. Feature Implementation
   - Implemented user authentication system
   - Added password reset functionality
   - Integrated with OAuth providers (Google, GitHub)
   
2. Bug Fixes
   - Fixed memory leak in data processing module
   - Resolved issue with API response timeouts
   - Corrected UI rendering on mobile devices
   
3. Performance Improvements
   - Optimized database queries (reduced load time by 40%)
   - Implemented caching for frequently accessed data
   - Reduced API response times by 25%
   
4. Testing
   - Added unit tests for new authentication endpoints
   - Created integration tests for user workflows
   - Updated test coverage to 85%
   
5. Documentation
   - Updated API documentation with new endpoints
   - Created user guides for authentication features
   - Added developer documentation for database schema
    """
    
    # Save sample notes to file
    with open('sample_notes.txt', 'w') as f:
        f.write(sample_notes)
    
    print("Sample engineering notes saved to sample_notes.txt")
    
    # Initialize converter
    converter = NGNotesConverter()
    
    # Load the notes
    notes = converter.load_engineering_notes('sample_notes.txt')
    if not notes:
        print("Failed to load notes")
        return
    
    print("\n=== Processing Notes ===")
    
    # Generate summary with default model
    default_config = converter.get_model_config("gpt-3.5-turbo")
    result = converter.generate_summary(notes, default_config)
    
    print(f"\nGenerated summary using {result.model_config.name}:")
    print("-" * 50)
    print(result.summary)
    print("-" * 50)
    
    # Run parameter sweep
    print("\n=== Running Parameter Sweep ===")
    results = converter.run_parameter_sweep(notes)
    
    # Compare models
    comparison = converter.compare_models(results)
    
    print(f"\nBest model: {comparison['best_model']}")
    print("\nOverall best summary:")
    print("-" * 50)
    print(comparison['overall_best_summary'])
    print("-" * 50)
    
    # Save the best summary
    converter.save_summary(comparison['overall_best_summary'], 'generated_summary.txt')
    print("\nBest summary saved to generated_summary.txt")
    
    # Clean up
    os.remove('sample_notes.txt')
    print("Sample files cleaned up")

if __name__ == "__main__":
    main()