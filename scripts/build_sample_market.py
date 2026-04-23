from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import requests


TARGETS = [
    ("1.600519", "600519", "SH"),
    ("0.300750", "300750", "SZ"),
    ("0.000858", "000858", "SZ"),
    ("1.601318", "601318", "SH"),
    ("0.000001", "000001", "SZ"),
    ("0.002594", "002594", "SZ"),
    ("1.600036", "600036", "SH"),
    ("1.601899", "601899", "SH"),
    ("1.600276", "600276", "SH"),
    ("0.000333", "000333", "SZ"),
    ("0.002415", "002415", "SZ"),
    ("1.601012", "601012", "SH"),
    ("1.600031", "600031", "SH"),
    ("0.000725", "000725", "SZ"),
    ("1.601166", "601166", "SH"),
    ("1.600309", "600309", "SH"),
    ("1.601398", "601398", "SH"),
    ("0.002230", "002230", "SZ"),
    ("1.688111", "688111", "SH"),
    ("0.300308", "300308", "SZ"),
    ("1.600887", "600887", "SH"),
    ("0.002271", "002271", "SZ"),
    ("1.601088", "601088", "SH"),
    ("0.000568", "000568", "SZ"),
]

SESSION = requests.Session()
SESSION.trust_env = False


def fetch_series(secid: str, code: str, market: str) -> dict:
    response = SESSION.get(
        "https://push2his.eastmoney.com/api/qt/stock/kline/get",
        params={
            "secid": secid,
            "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "klt": "101",
            "fqt": "1",
            "beg": "20240101",
            "end": "20500101",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    data = payload["data"]

    candles = []
    for item in data["klines"][-240:]:
        date, open_, close, high, low, volume, amount, *_rest = item.split(",")
        candles.append(
            {
                "date": date,
                "open": float(open_),
                "close": float(close),
                "low": float(low),
                "high": float(high),
                "volume": float(volume),
                "amount": float(amount),
            }
        )

    return {
        "code": code,
        "name": data["name"],
        "market": market,
        "source": "sample",
        "candles": candles,
    }


def main() -> None:
    symbols = [fetch_series(secid, code, market) for secid, code, market in TARGETS]
    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "eastmoney-sample",
        "symbols": symbols,
    }

    out_path = Path(__file__).resolve().parents[1] / "public" / "sample-market-snapshot.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
