#!/usr/bin/env python3
"""Downloads the ForeverChanges patch-notes RSS feed and writes patch-notes.json.

Keeps the title, date, link and the feed's own short summary for each entry, plus a
type (hotfix / build / other). Entries are remembered between runs, so history isn't
lost if the feed trims old items. Python standard library only.
"""
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

FEED_URL = os.environ.get("FEED_URL", "https://foreverchanges.pro/patch-notes/feed.xml")
OUT_FILE = "patch-notes.json"
LINK_PREFIX = "https://foreverchanges.pro/"
KEEP = 80


def fetch():
    path = os.environ.get("FEED_FILE")
    if path:
        return open(path, "rb").read()
    req = urllib.request.Request(FEED_URL, headers={"User-Agent": "DirtySocksGuildSite/1.0 (guild patch notes page)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def plain(text):
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    return re.sub(r"\s+", " ", text).strip()


def kind_of(title):
    t = title.lower()
    if t.startswith("hotfix"):
        return "hotfix"
    if t.startswith("build"):
        return "build"
    return "other"


def parse(xml_bytes):
    root = ET.fromstring(xml_bytes)
    channel = root.find("channel")
    if channel is None:
        raise ValueError("no <channel> in feed")
    entries = []
    for item in channel.findall("item"):
        title = plain(item.findtext("title"))
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or link or title).strip()
        try:
            date = parsedate_to_datetime(item.findtext("pubDate") or "").astimezone(timezone.utc).isoformat(timespec="seconds")
        except Exception:
            date = None
        if not title or not date:
            continue
        if not link.startswith(LINK_PREFIX):
            link = LINK_PREFIX + "patch-notes"
        entries.append({"id": guid, "title": title, "date": date, "link": link,
                        "summary": plain(item.findtext("description")), "kind": kind_of(title)})
    return plain(channel.findtext("title")) or "ForeverChanges: Patch notes", entries


def main():
    try:
        title, entries = parse(fetch())
    except Exception as ex:
        print("Could not read the feed:", ex)
        return 1
    if not entries:
        print("The feed had no usable entries, so", OUT_FILE, "was left unchanged.")
        return 1

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    old, first_run = {}, True
    if os.path.exists(OUT_FILE):
        try:
            old = {e["id"]: e for e in json.load(open(OUT_FILE, encoding="utf-8"))["entries"]}
            first_run = False
        except Exception:
            old, first_run = {}, True

    new_ids = []
    for e in entries:
        prev = old.get(e["id"])
        if prev:
            e["firstSeen"] = prev.get("firstSeen")
        else:
            e["firstSeen"] = None if first_run else now  # no "New" badges on the very first run
            if not first_run:
                new_ids.append(e["title"])

    seen = {e["id"] for e in entries}
    merged = entries + [e for i, e in old.items() if i not in seen]
    merged.sort(key=lambda e: e["date"], reverse=True)
    merged = merged[:KEEP]

    data = {"generated": now, "source": FEED_URL, "siteName": "ForeverChanges", "siteUrl": LINK_PREFIX + "patch-notes",
            "title": title, "entries": merged}
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Read %d entries (newest: %s); %d new since last run: %s"
          % (len(entries), merged[0]["title"], len(new_ids), ", ".join(new_ids) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
