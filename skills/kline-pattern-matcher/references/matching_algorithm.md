# Matching Algorithm Reference

The skill uses the same scoring idea as the web demo.

1. Normalize both query and candidate close-price windows to `[0, 1]`.
2. Resample the query curve to the selected window length.
3. Score every sliding window:
   - Correlation score: `(pearson(query, candidate) + 1) / 2`
   - Shape score: `max(0, 1 - mean_absolute_error(query, candidate))`
   - Direction score: `max(0, 1 - abs(query_end_delta - candidate_end_delta))`
4. Total score: `0.55 * correlation + 0.35 * shape + 0.10 * direction`.
5. Keep the highest scoring windows and render each result as a PNG with candlesticks and volume bars.

For `match-reference`, the reference stock/date range first becomes the query curve. By default, the source stock itself is excluded from the matched results so the returned images focus on other stocks.
