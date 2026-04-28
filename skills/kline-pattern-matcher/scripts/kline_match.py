from __future__ import annotations

import argparse
import json
import math
import socket
import threading
import time
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle


SKILL_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = SKILL_DIR / "assets"
OUTPUTS_DIR = SKILL_DIR / "outputs"
DEFAULT_MARKET = ASSETS_DIR / "sample-market-snapshot.json"
DRAW_DIALOG = ASSETS_DIR / "draw-dialog" / "index.html"


@dataclass
class Candle:
    date: str
    open: float
    close: float
    low: float
    high: float
    volume: float
    amount: float = 0.0


@dataclass
class StockSeries:
    code: str
    name: str
    market: str
    candles: list[Candle]


@dataclass
class MatchResult:
    code: str
    name: str
    market: str
    score: float
    correlation: float
    shape_score: float
    direction_score: float
    start_index: int
    end_index: int
    candles: list[Candle]
    normalized_close: list[float]


def resolve_path(path: str | Path) -> Path:
    candidate = Path(path)
    if candidate.is_absolute() and candidate.exists():
        return candidate
    if candidate.exists():
        return candidate
    for base in (SKILL_DIR, OUTPUTS_DIR):
        fallback = base / candidate
        if fallback.exists():
            return fallback
    return candidate


def compact_date(value: str) -> str:
    value = value.strip()
    if len(value) == 8 and value.isdigit():
        return f"{value[:4]}-{value[4:6]}-{value[6:8]}"
    return value


def normalize_code(value: str) -> str:
    return value.strip().upper().split(".")[0]


def normalize_series(values: list[float]) -> list[float]:
    if not values:
        return []
    min_value = min(values)
    max_value = max(values)
    if abs(max_value - min_value) < 1e-9:
        return [0.5 for _ in values]
    return [(value - min_value) / (max_value - min_value) for value in values]


def resample(values: list[float], target_length: int) -> list[float]:
    if target_length <= 0:
        return []
    if not values:
        return []
    if len(values) == target_length:
        return [float(value) for value in values]
    if len(values) == 1:
        return [float(values[0]) for _ in range(target_length)]

    result: list[float] = []
    for index in range(target_length):
        position = index * (len(values) - 1) / max(1, target_length - 1)
        left = int(math.floor(position))
        right = min(left + 1, len(values) - 1)
        ratio = position - left
        result.append(float(values[left]) + (float(values[right]) - float(values[left])) * ratio)
    return result


def pearson_correlation(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    left_mean = sum(left) / len(left)
    right_mean = sum(right) / len(right)
    numerator = 0.0
    left_denominator = 0.0
    right_denominator = 0.0
    for left_value, right_value in zip(left, right):
        left_diff = left_value - left_mean
        right_diff = right_value - right_mean
        numerator += left_diff * right_diff
        left_denominator += left_diff * left_diff
        right_denominator += right_diff * right_diff
    denominator = math.sqrt(left_denominator * right_denominator)
    if denominator == 0:
        return 0.0
    return numerator / denominator


def mean_absolute_error(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 1.0
    return sum(abs(left_value - right_value) for left_value, right_value in zip(left, right)) / len(left)


def score_window(query_curve: list[float], candidate_curve: list[float]) -> tuple[float, float, float, float]:
    correlation = (pearson_correlation(query_curve, candidate_curve) + 1) / 2
    shape_score = max(0.0, 1 - mean_absolute_error(query_curve, candidate_curve))
    query_direction = query_curve[-1] - query_curve[0]
    candidate_direction = candidate_curve[-1] - candidate_curve[0]
    direction_score = max(0.0, 1 - abs(query_direction - candidate_direction))
    score = correlation * 0.55 + shape_score * 0.35 + direction_score * 0.10
    return score, correlation, shape_score, direction_score


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def load_market(path: Path = DEFAULT_MARKET) -> list[StockSeries]:
    payload = read_json(path)
    result: list[StockSeries] = []
    for item in payload.get("symbols", []):
        candles = [
            Candle(
                date=str(candle["date"]),
                open=float(candle["open"]),
                close=float(candle["close"]),
                low=float(candle["low"]),
                high=float(candle["high"]),
                volume=float(candle.get("volume", 0)),
                amount=float(candle.get("amount", 0)),
            )
            for candle in item.get("candles", [])
        ]
        if candles:
            result.append(
                StockSeries(
                    code=str(item.get("code", "")),
                    name=str(item.get("name", item.get("code", ""))),
                    market=str(item.get("market", "")),
                    candles=candles,
                )
            )
    return result


def find_stock(market: list[StockSeries], code_or_name: str) -> StockSeries:
    query = code_or_name.strip()
    normalized = normalize_code(query)
    matches = [
        series
        for series in market
        if normalize_code(series.code) == normalized or query in series.name or series.name in query
    ]
    if not matches:
        available = ", ".join(f"{series.code}({series.name})" for series in market[:12])
        raise SystemExit(f"未在样本库中找到 {query}。可用示例：{available}")
    if len(matches) > 1:
        options = ", ".join(f"{series.code}({series.name})" for series in matches[:8])
        raise SystemExit(f"股票名称不唯一，请指定代码。候选：{options}")
    return matches[0]


def slice_candles(series: StockSeries, start_date: str, end_date: str) -> list[Candle]:
    start = compact_date(start_date)
    end = compact_date(end_date)
    candles = [candle for candle in series.candles if start <= candle.date <= end]
    if len(candles) < 5:
        raise SystemExit(f"{series.code} {series.name} 在 {start} 至 {end} 的样本数据不足。")
    return candles


def find_top_matches(
    market: list[StockSeries],
    query_curve: list[float],
    window_size: int,
    top_n: int,
    exclude_code: str | None = None,
) -> list[MatchResult]:
    query = normalize_series(resample(query_curve, window_size))
    results: list[MatchResult] = []
    excluded = normalize_code(exclude_code) if exclude_code else None

    for series in market:
        if excluded and normalize_code(series.code) == excluded:
            continue
        if len(series.candles) < window_size:
            continue

        closes = [candle.close for candle in series.candles]
        for start_index in range(0, len(closes) - window_size + 1):
            window_closes = closes[start_index : start_index + window_size]
            normalized_close = normalize_series(window_closes)
            score, correlation, shape_score, direction_score = score_window(query, normalized_close)
            result = MatchResult(
                code=series.code,
                name=series.name,
                market=series.market,
                score=score,
                correlation=correlation,
                shape_score=shape_score,
                direction_score=direction_score,
                start_index=start_index,
                end_index=start_index + window_size - 1,
                candles=series.candles[start_index : start_index + window_size],
                normalized_close=normalized_close,
            )
            if len(results) < top_n or score > results[-1].score:
                results.append(result)
                results.sort(key=lambda item: item.score, reverse=True)
                del results[top_n:]

    return results


def format_percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def safe_filename(value: str) -> str:
    allowed = []
    for char in value:
        if char.isalnum() or char in ("-", "_"):
            allowed.append(char)
        else:
            allowed.append("_")
    return "".join(allowed).strip("_")


def configure_matplotlib() -> None:
    plt.rcParams["font.sans-serif"] = [
        "Microsoft YaHei",
        "SimHei",
        "Noto Sans CJK SC",
        "Arial Unicode MS",
        "DejaVu Sans",
    ]
    plt.rcParams["axes.unicode_minus"] = False


def render_match_png(result: MatchResult, rank: int, output_dir: Path) -> Path:
    configure_matplotlib()
    output_dir.mkdir(parents=True, exist_ok=True)
    dates = [mdates.datestr2num(candle.date) for candle in result.candles]
    volumes = [candle.volume for candle in result.candles]
    file_stem = safe_filename(
        f"match_{rank:02d}_{result.code}_{result.candles[0].date}_{result.candles[-1].date}"
    )
    output_path = output_dir / f"{file_stem}.png"

    fig, (ax_price, ax_volume) = plt.subplots(
        2,
        1,
        figsize=(11, 6.2),
        dpi=150,
        sharex=True,
        gridspec_kw={"height_ratios": [3.2, 1], "hspace": 0.05},
    )
    fig.patch.set_facecolor("#f7f4ef")
    title = (
        f"TOP {rank}  {result.code} {result.name}  "
        f"{result.candles[0].date} 至 {result.candles[-1].date}  "
        f"相似度 {format_percent(result.score)}"
    )
    fig.suptitle(title, fontsize=15, fontweight="bold", color="#09233b", y=0.98)

    width = 0.62
    for date_value, candle in zip(dates, result.candles):
        rising = candle.close >= candle.open
        color = "#c45347" if rising else "#0c8e74"
        ax_price.vlines(date_value, candle.low, candle.high, color=color, linewidth=1.1)
        body_bottom = min(candle.open, candle.close)
        body_height = max(abs(candle.close - candle.open), 0.01)
        ax_price.add_patch(
            Rectangle(
                (date_value - width / 2, body_bottom),
                width,
                body_height,
                facecolor=color,
                edgecolor=color,
                linewidth=0.8,
            )
        )
        ax_volume.bar(date_value, candle.volume, width=width, color=color, alpha=0.72)

    ax_price.plot(dates, [candle.close for candle in result.candles], color="#1e6aa8", linewidth=1.2)
    ax_price.set_ylabel("价格")
    ax_volume.set_ylabel("成交量")
    ax_volume.xaxis_date()
    ax_volume.xaxis.set_major_formatter(mdates.DateFormatter("%m-%d"))

    for axis in (ax_price, ax_volume):
        axis.set_facecolor("#fffdf8")
        axis.grid(True, color="#dce4ec", linewidth=0.7, alpha=0.8)
        axis.tick_params(colors="#48586b", labelsize=8)
        for spine in axis.spines.values():
            spine.set_color("#cbd6e2")

    metrics = (
        f"相关性 {format_percent(result.correlation)}   "
        f"形态贴合 {format_percent(result.shape_score)}   "
        f"方向一致 {format_percent(result.direction_score)}"
    )
    fig.text(0.5, 0.905, metrics, ha="center", va="center", fontsize=10, color="#68778a")
    fig.autofmt_xdate(rotation=0)
    fig.savefig(output_path, bbox_inches="tight")
    plt.close(fig)
    return output_path


def write_summary(results: list[MatchResult], images: list[Path], output_dir: Path, query: dict[str, Any]) -> Path:
    summary = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "query": query,
        "results": [
            {
                "rank": index + 1,
                "code": result.code,
                "name": result.name,
                "market": result.market,
                "score": result.score,
                "scorePercent": format_percent(result.score),
                "correlation": result.correlation,
                "shapeScore": result.shape_score,
                "directionScore": result.direction_score,
                "startDate": result.candles[0].date,
                "endDate": result.candles[-1].date,
                "image": str(images[index].resolve()),
            }
            for index, result in enumerate(results)
        ],
    }
    output_path = output_dir / "match_summary.json"
    output_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path


def load_curve_json(path: Path) -> tuple[list[float], int | None]:
    payload = read_json(path)
    if isinstance(payload, list):
        return [float(value) for value in payload], None
    curve = payload.get("curve") or payload.get("values")
    if not isinstance(curve, list):
        raise SystemExit(f"{path} 中没有 curve 数组。")
    top_n = payload.get("topN") or payload.get("top_n")
    return [float(value) for value in curve], int(top_n) if top_n else None


def run_match_curve(args: argparse.Namespace) -> None:
    market = load_market(resolve_path(args.market))
    curve_path = resolve_path(args.curve_json)
    curve, top_n_from_file = load_curve_json(curve_path)
    top_n = args.top_n or top_n_from_file or 5
    output_dir = Path(args.output_dir) if args.output_dir else OUTPUTS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    results = find_top_matches(market, curve, args.window_size, top_n)
    if not results:
        raise SystemExit("没有找到匹配结果。")

    images = [render_match_png(result, index + 1, output_dir) for index, result in enumerate(results)]
    summary_path = write_summary(results, images, output_dir, {"type": "drawn_curve", "curveJson": str(curve_path)})
    print(f"Generated summary: {summary_path.resolve()}")
    for image in images:
        print(f"Generated image: {image.resolve()}")


def run_match_reference(args: argparse.Namespace) -> None:
    market = load_market(resolve_path(args.market))
    source = find_stock(market, args.code)
    reference_candles = slice_candles(source, args.start_date, args.end_date)
    curve = normalize_series([candle.close for candle in reference_candles])
    window_size = args.window_size or len(reference_candles)
    top_n = args.top_n or 5
    output_dir = Path(args.output_dir) if args.output_dir else OUTPUTS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    results = find_top_matches(
        market,
        curve,
        window_size,
        top_n,
        exclude_code=None if args.include_source else source.code,
    )
    if not results:
        raise SystemExit("没有找到匹配结果。")

    images = [render_match_png(result, index + 1, output_dir) for index, result in enumerate(results)]
    summary_path = write_summary(
        results,
        images,
        output_dir,
        {
            "type": "reference_stock",
            "code": source.code,
            "name": source.name,
            "startDate": compact_date(args.start_date),
            "endDate": compact_date(args.end_date),
            "windowSize": window_size,
        },
    )
    print(f"Generated summary: {summary_path.resolve()}")
    for image in images:
        print(f"Generated image: {image.resolve()}")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def run_draw(args: argparse.Namespace) -> None:
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = Path(args.output) if args.output else OUTPUTS_DIR / "query_curve.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    port = args.port or find_free_port()
    submitted = threading.Event()

    class DrawHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            return

        def do_GET(self) -> None:  # noqa: N802
            if self.path not in ("/", "/index.html"):
                self.send_response(404)
                self.end_headers()
                return
            body = DRAW_DIALOG.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/submit":
                self.send_response(404)
                self.end_headers()
                return
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            curve = payload.get("curve")
            if not isinstance(curve, list) or len(curve) < 2:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"invalid curve")
                return
            output_path.write_text(
                json.dumps(
                    {
                        "curve": [float(value) for value in curve],
                        "topN": int(payload.get("topN") or args.top_n or 5),
                        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "path": str(output_path)}).encode("utf-8"))
            submitted.set()

    server = HTTPServer(("127.0.0.1", port), DrawHandler)
    url = f"http://127.0.0.1:{port}/"
    print(f"Draw dialog: {url}")
    print(f"Waiting for submit. Output: {output_path.resolve()}")
    if not args.no_open:
        webbrowser.open(url)

    deadline = time.time() + args.timeout
    while not submitted.is_set() and time.time() < deadline:
        server.timeout = 0.5
        server.handle_request()
    server.server_close()

    if not submitted.is_set():
        raise SystemExit(f"等待提交超时。绘图页面地址：{url}")
    print(f"Saved curve: {output_path.resolve()}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="K-line curve matching skill CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    draw = subparsers.add_parser("draw", help="open local drawing page and save query curve JSON")
    draw.add_argument("--top-n", type=int, default=5)
    draw.add_argument("--output", default=str(OUTPUTS_DIR / "query_curve.json"))
    draw.add_argument("--port", type=int, default=0)
    draw.add_argument("--timeout", type=int, default=600)
    draw.add_argument("--no-open", action="store_true")
    draw.set_defaults(func=run_draw)

    match_curve = subparsers.add_parser("match-curve", help="match a curve JSON against market windows")
    match_curve.add_argument("--curve-json", default=str(OUTPUTS_DIR / "query_curve.json"))
    match_curve.add_argument("--top-n", type=int, default=None)
    match_curve.add_argument("--window-size", type=int, default=48)
    match_curve.add_argument("--market", default=str(DEFAULT_MARKET))
    match_curve.add_argument("--output-dir", default=str(OUTPUTS_DIR))
    match_curve.set_defaults(func=run_match_curve)

    match_reference = subparsers.add_parser("match-reference", help="use a stock/date range as the query curve")
    match_reference.add_argument("--code", required=True, help="stock code or unique company name")
    match_reference.add_argument("--start-date", required=True)
    match_reference.add_argument("--end-date", required=True)
    match_reference.add_argument("--top-n", type=int, default=5)
    match_reference.add_argument("--window-size", type=int, default=None)
    match_reference.add_argument("--market", default=str(DEFAULT_MARKET))
    match_reference.add_argument("--output-dir", default=str(OUTPUTS_DIR))
    match_reference.add_argument("--include-source", action="store_true")
    match_reference.set_defaults(func=run_match_reference)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
