import requests
import sys

TARGET_URL = "https://samakal.com/opinion"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.google.com/",
    "DNT": "1",
}

r = requests.get(TARGET_URL, headers=HEADERS, timeout=30)

if r.status_code != 200:
    print(f"HTTP {r.status_code}")
    sys.exit(1)

if "challenge" in r.text.lower() or "cf-chl" in r.text.lower():
    print("Cloudflare challenge detected — direct request blocked")
    sys.exit(1)

with open("opinion.html", "w", encoding="utf-8") as f:
    f.write(r.text)