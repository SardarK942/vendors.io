#!/usr/bin/env python3
"""
Enrich a vendor's website with ScrapeGraphAI + Claude Haiku.

Usage:
  uv run python enrich_website.py --url https://example.com --out path/to/out.json
"""
import argparse
import json
import os
import sys
from pathlib import Path

from scrapegraphai.graphs import SmartScraperGraph

PROMPT = (
    "Extract from this business website: business_name, services (list), "
    "pricing_range (string), contact (phone, email), social_handles "
    "(instagram, facebook, tiktok), and up to 5 sample_photo_urls."
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
            "model_tokens": 8192,
        },
        "verbose": False,
        "headless": True,
    }

    graph = SmartScraperGraph(prompt=PROMPT, source=args.url, config=graph_config)
    result = graph.run()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
