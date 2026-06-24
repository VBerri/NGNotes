#!/usr/bin/env python3
"""
prepare_scitldr.py: Convert SciTLDR JSONL to NGNotes evaluator format.

Usage:
    python scripts/prepare_scitldr.py \\
        --input-file ../data/SciTLDR-A-test.jsonl \\
        --output ../data/scitldr_swapped.json

    # Limit to first 100 records:
    python scripts/prepare_scitldr.py \\
        --input-file ../data/SciTLDR-A-test.jsonl \\
        --output ../data/scitldr_swapped.json \\
        --limit 100
"""

import argparse
import sys
from pathlib import Path

# Allow running from any working directory (e.g., `cd backend && python scripts/...`)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.dataset_adapters import load_scitldr_jsonl, save_eval_dataset


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert SciTLDR JSONL to NGNotes evaluation format"
    )
    parser.add_argument(
        "--input-file",
        required=True,
        metavar="PATH",
        help="Path to the SciTLDR JSONL source file",
    )
    parser.add_argument(
        "--output",
        required=True,
        metavar="PATH",
        help="Output JSON file path",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Limit conversion to the first N records (default: all)",
    )
    args = parser.parse_args()

    print(f"Loading SciTLDR data from: {args.input_file}")
    records = load_scitldr_jsonl(args.input_file)

    if args.limit is not None:
        records = records[: args.limit]

    print(f"Converted {len(records)} records")
    save_eval_dataset(records, args.output)
    print(f"Saved to: {args.output}")


if __name__ == "__main__":
    main()
