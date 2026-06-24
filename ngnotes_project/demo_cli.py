#!/usr/bin/env python3
"""
Demo of CLI usage for NGNotes converter
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Create sample input file
sample_content = """
Engineering Notes - API Development

1. Requirements Analysis
   - User authentication requirements documented
   - Data privacy compliance requirements identified
   - Performance benchmarks defined

2. Implementation Progress
   - REST API endpoints created for user management
   - Database schema designed and implemented
   - Authentication middleware developed

3. Testing Completed
   - Unit tests for all endpoints (95% coverage)
   - Integration tests for authentication flows
   - Security penetration testing completed

4. Deployment
   - Staging environment deployed
   - Production deployment scheduled for next week
   - Monitoring and alerting configured
"""

with open('demo_input.txt', 'w') as f:
    f.write(sample_content)

print("Created demo input file: demo_input.txt")
print("\nYou can now run the following commands:")
print("\n1. Basic usage:")
print("   python src/main.py --input demo_input.txt --output basic_summary.txt")
print("\n2. Using specific model:")
print("   python src/main.py --input demo_input.txt --output gpt4_summary.txt --model gpt-4")
print("\n3. Compare all models:")
print("   python src/main.py --input demo_input.txt --output comparison_summary.txt --compare")

print("\nAfter running these commands, you'll see the generated summaries in the output files.")