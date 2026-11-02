"""Collect publicly visible per-video statistics with no account credentials."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import json
import re
import time
from urllib.request import Request, urlopen

DEST = Path(__file__).resolve().parents[1] / "assets" / "peer-feed.json"
NOW = int(time.time() * 1000)
CUTOFF = NOW - 7 * 86400000

def fetch_page(url):
    req = Request(url, headers={"User-Agent": "TopicRadar/1.0"})
    with urlopen(req, timeout=18) as response:
        body = json.load(response)
    if body.get("code") != 0 or not isinstance(body.get("data", {}).get("list"), list):
        raise ValueError("作品源暂时没有返回可用榜单")
    result = []
    for item in body["data"]["list"]:
        bv, stat = item.get("bvid", ""), item.get("stat", {})
        published = int(item.get("pubdate", 0)) * 1000
        author = item.get("owner", {}).get("name", "")
        if not re.fullmatch(r"BV[A-Za-z0-9]{10}", bv) or not CUTOFF <= published <= NOW:
            continue
        if not item.get("title") or not author or not isinstance(stat.get("like"), int):
            continue
        row = dict(platform="哔哩哔哩", kind="视频", title=item["title"], author=author,
                   url="https://www.bilibili.com/video/"+bv, publishedAt=published,
                   observedAt=NOW, category=item.get("tname", ""))
        for name, key in [("likes","like"),("views","view"),("comments","reply"),("saves","favorite")]:
            if isinstance(stat.get(key), int) and stat[key] >= 0:
                row[name] = stat[key]
        result.append(row)
    return result

def main():
    old = json.loads(DEST.read_text()) if DEST.exists() else {"works":[]}
    latest = {w["url"]:w for w in old["works"] if w["publishedAt"] >= CUTOFF}
    urls = [f"https://api.bilibili.com/x/web-interface/popular?ps=50&pn={page}" for page in range(1, 6)]
    # These category feeds widen coverage beyond the general popularity list.
    urls += [f"https://api.bilibili.com/x/web-interface/ranking/v2?rid={rid}&type=all"
             for rid in (188, 155, 211, 36)]
    pages = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = [pool.submit(fetch_page, url) for url in urls]
        for request in pending:
            try:
                pages.append(request.result())
            except (OSError, ValueError) as error:
                print("Feed unavailable:", type(error).__name__)
    fresh = [row for rows in pages for row in rows]
    if not fresh:
        raise RuntimeError("没有新样本，保留上次采集结果")
    latest.update((w["url"],w) for w in fresh)
    works = sorted(latest.values(), key=lambda w: (-w["publishedAt"],w["url"]))
    tmp = DEST.with_suffix(".tmp")
    tmp.write_text(json.dumps({"updatedAt":NOW,"works":works}, ensure_ascii=False,separators=(",",":"))+"\n")
    tmp.replace(DEST)
    print("Public works:", len(works), "observed", datetime.now(timezone.utc).isoformat())

if __name__ == "__main__":
    main()
