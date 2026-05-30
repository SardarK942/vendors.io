#!/usr/bin/env python3
"""
SearchGraph: search engine query → extract structured vendor data from top results.

Usage:
  uv run python search_discover.py --query "Pakistani caterers Lombard IL" --out path
"""
import argparse
import json
import os
import sys
from pathlib import Path

from scrapegraphai.graphs import SearchGraph


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-results", type=int, default=5)
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY required", file=sys.stderr)
        sys.exit(1)

    config = {
        "llm": {
            "api_key": api_key,
            "model": "anthropic/claude-haiku-4-5-20251001",
            "model_tokens": 4096,
        },
        "max_results": args.max_results,
        "verbose": False,
        "headless": True,
    }
    prompt = (
        "Extract for each vendor found: business_name, website, phone, address, "
        "instagram_handle if visible, and a one-sentence description."
    )
    graph = SearchGraph(prompt=prompt, config=config, source=args.query)
    result = graph.run()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
