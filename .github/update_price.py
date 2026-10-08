"""Runs on GitHub (not on the phone): fetch today's public VWCE quote and write price.json next to the app.

Phones can't read justETF directly (the site doesn't allow other websites to read it), but they can read
a file on the app's own address. If the fetch fails, the last good price.json is kept — never a guess.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

URL = "https://www.justetf.com/api/etfs/IE00BK5BQT80/quote?locale=en&currency=EUR"
UA = "FIRE-Manager price updater (GitHub Actions; read-only, once a day)"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def main():
    try:
        q = get(URL)
        price = q["latestQuote"]["raw"]
        if not (isinstance(price, (int, float)) and 10 < price < 2000):
            raise ValueError(f"unexpected price {price!r}")
        out = {"latestQuote": {"raw": price}, "latestQuoteDate": q.get("latestQuoteDate"),
               "quoteTradingVenue": q.get("quoteTradingVenue"), "isin": "IE00BK5BQT80",
               "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="minutes")}
        with open("price.json", "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1)
        print("price.json:", out)
    except Exception as e:  # keep the previous file; the app shows its date
        base = os.environ.get("PAGES_URL", "").rstrip("/")
        print(f"justETF failed ({e}); keeping the last published price", file=sys.stderr)
        if base:
            try:
                prev = get(base + "/price.json")
                with open("price.json", "w", encoding="utf-8") as f:
                    json.dump(prev, f, indent=1)
            except Exception as e2:
                print(f"could not read the live price.json either ({e2}); using the one in the repository", file=sys.stderr)


if __name__ == "__main__":
    main()
