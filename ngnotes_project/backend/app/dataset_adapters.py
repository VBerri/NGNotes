"""
NGNotes: Dataset adapters for SciTLDR and NGNotes evaluation format.
"""

import json
from typing import List, Dict, Any
from pathlib import Path


def convert_scitldr_entry(entry: Dict[str, Any], case_id: str = "") -> Dict[str, Any]:
    """
    Convert a single SciTLDR entry to NGNotes evaluation format.

    SciTLDR mapping (swapped):
      - target[0]  →  engineering_note   (input to the model)
      - source     →  reference_summary  (ground truth for scoring)
    """
    target = entry.get("target", [])
    source = entry.get("source", "")

    if isinstance(target, list):
        engineering_note = target[0] if target else ""
    else:
        engineering_note = str(target)

    if isinstance(source, list):
        reference_summary = " ".join(str(s) for s in source)
    else:
        reference_summary = str(source)

    return {
        "case_id": case_id or entry.get("paper_id", ""),
        "engineering_note": engineering_note.strip(),
        "reference_summary": reference_summary.strip(),
    }


def load_scitldr_jsonl(file_path: str) -> List[Dict[str, Any]]:
    """Load a SciTLDR JSONL file and return a list of NGNotes eval cases."""
    results: List[Dict[str, Any]] = []
    path = Path(file_path)

    with path.open("r", encoding="utf-8") as fh:
        for idx, line in enumerate(fh):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                record = convert_scitldr_entry(entry, case_id=f"scitldr-{idx:04d}")
                results.append(record)
            except json.JSONDecodeError:
                continue

    return results


def load_eval_dataset(file_path: str) -> List[Dict[str, Any]]:
    """Load a pre-formatted NGNotes eval dataset from a JSON file."""
    with open(file_path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_eval_dataset(records: List[Dict[str, Any]], output_path: str) -> None:
    """Save a list of eval cases to a JSON file."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2, ensure_ascii=False)
