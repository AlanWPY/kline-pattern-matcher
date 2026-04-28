---
name: kline-pattern-matcher
description: Match user-drawn or reference-stock price curves against historical A-share candlestick windows and generate PNG result charts. Use when the user asks to draw a curve to find similar K-line patterns, compare a stock's trend over a date range with other stocks, search for similar candlestick/K线走势, or produce K-line matching images with similarity scores.
---

# K-Line Pattern Matcher

Use this skill to match a hand-drawn normalized curve or a reference stock/date range against a local A-share sample market. The skill returns ranked candlestick images with stock code, company name, date span, similarity score, K-line chart, and volume bars.

## Quick Start

Run commands from the repository root or from this skill directory. The main CLI is:

```bash
python skills/kline-pattern-matcher/scripts/kline_match.py <command> [options]
```

For a user who wants to draw a curve:

```bash
python skills/kline-pattern-matcher/scripts/kline_match.py draw --top-n 5
python skills/kline-pattern-matcher/scripts/kline_match.py match-curve --curve-json skills/kline-pattern-matcher/outputs/query_curve.json --top-n 5
```

For a user who asks to match a stock over a date range:

```bash
python skills/kline-pattern-matcher/scripts/kline_match.py match-reference --code 600519 --start-date 2025-10-01 --end-date 2025-12-31 --top-n 5
```

## Workflow

1. If the user asks to draw a curve, run `draw`. It opens a local browser page with a canvas and a match-count input. After the user clicks Submit, it writes `outputs/query_curve.json`.
2. Run `match-curve` using that JSON. Return the generated PNG paths and summarize the top matches.
3. If the user names a stock and date range, run `match-reference`. Use the stock's normalized close-price curve as the query and match other stocks.
4. If a stock name is ambiguous or not found in the local sample, ask the user for the stock code. The local sample includes common A-share codes such as `600519`.

## Data Source

The default data source is `assets/sample-market-snapshot.json`, copied into this skill so it works offline after installation from GitHub. Tushare is a planned extension; do not require a Tushare token for the default workflow.

## Outputs

Generated files go to `outputs/` by default:

- `query_curve.json`: curve submitted by the draw dialog.
- `match_summary.json`: ranked result metadata.
- `match_*.png`: one image per matched K-line window.

When answering the user, include the top result images and mention the score, stock code, name, and date range. The result images are the primary deliverable.

## Notes

- The scoring model combines Pearson correlation, shape fit, and direction consistency.
- The drawing dialog is implemented as a local browser page because Agent chat UIs do not provide a universal native popup API.
- Keep the existing web app separate; it is the public demonstration site, while this skill is the installable Agent capability.
