#!/usr/bin/env python3
"""
Detect whether a restaurant website offers catering.

Usage:
  uv run python catering_signal.py --url https://restaurant.com --out path/to/out.json
"""
import argparse
import json
import os
import sys
from pathlib import Path

from scrapegraphai.graphs import SmartScraperGraph

PROMPT = (
    "Does this restaurant offer catering for events or weddings? "
    "If yes, extract: offers_catering=true, catering_page_url, "
    "minimum_order_dollars (integer), catering_phone, catering_email, "
    "sample_menu_items (list of strings). If no, return offers_catering=false."
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY required", file=sys.stderr)
        sys.exit(1)

    graph_config = {
        "llm": {
            "api_key": api_key,
            "model": "anthropic/claude-haiku-4-5-20251001",
            "model_tokens": 4096,
        },
        "headless": True,
        "verbose": False,
    }
    graph = SmartScraperGraph(prompt=PROMPT, source=args.url, config=graph_config)
    result = graph.run()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
