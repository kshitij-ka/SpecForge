"""Root-level entry point required by hackathon judges.

Delegates entirely to src/inference.py so all logic stays in one place.
Usage: python inference.py --input dataset.json --output results.json
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from inference import main  # noqa: E402

if __name__ == "__main__":
    main()
