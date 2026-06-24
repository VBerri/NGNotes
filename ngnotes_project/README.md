# NGNotes: Engineering Notes to Report Converter

NGNotes is a tool that converts engineering notes into professional reports using various language models.

## Features

- Support for multiple language models (GPT-3.5, GPT-4, Claude, Llama)
- Parameter sweep and model comparison
- Flexible input/output handling
- Evaluation metrics for generated summaries
- Command-line interface for easy usage

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd ngnotes_project

# Install dependencies (if any)
pip install -r requirements.txt
```

## Usage

### Basic usage

```bash
python src/main.py --input notes.txt --output summary.txt
```

### Using a specific model

```bash
python src/main.py --input notes.txt --output summary.txt --model gpt-4
```

### Comparing results from multiple models

```bash
python src/main.py --input notes.txt --output summary.txt --compare
```

## Input Format

The input file should contain engineering notes in plain text format. The tool will process the content and generate a structured summary.

## Output Format

The output is a formatted summary report that can be used for documentation, presentations, or further processing.

## Example Usage

You can also run the example script to see how the tool works:

```bash
python example_usage.py
```

This will create sample notes, process them with different models, and generate a comparison of results.

## Project Structure

- `src/` - Source code directory
  - `converter.py` - Core conversion logic
  - `models.py` - Data structures and model configurations
  - `evaluation.py` - Summary evaluation logic
  - `main.py` - Main command-line interface
- `tests/` - Unit tests
- `example_usage.py` - Example usage script

## Supported Models

The tool currently supports:
- GPT-3.5 Turbo (OpenAI)
- GPT-4 (OpenAI) 
- Claude 2 (Anthropic)
- Llama 2 7B (Hugging Face)

## Testing

To run the unit tests:

```bash
python -m pytest tests/test_converter.py -v
```

## License

This project is licensed under the MIT License.

## Configuration

Model configurations are defined in `src/models.py`. You can modify these to adjust parameters like temperature and top_p for different models.

## License

MIT License
