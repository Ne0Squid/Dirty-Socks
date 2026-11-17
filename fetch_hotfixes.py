#!/usr/bin/env python3
"""Reads Blizzard's WoW: Forever hotfix page and writes hotfixes.json.

For every dated section it records the date, the categories (Classes, Dungeons, Items...),
how many changes each one lists, and which classes/dungeons are named. It deliberately
stores counts and headings only, not Blizzard's note text; the site links back to Blizzard
for the details. Python standard library only.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

SOURCE_URL = os.environ.get("HOTFIX_URL", "https://worldofwarcraft.blizzard.com/en-us/news/24315281")
OUT_FILE = "hotfixes.json"
MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"], 1)}
DATE_RE = re.compile(r"^(%s) (\d{1,2}), (\d{4})$" % "|".join(MONTHS))
NOTE_RE = re.compile(r"^Developers\W{0,3}\s*notes", re.I)
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
SKIP = {"script", "style", "noscript", "template"}


# ---------- tiny HTML tree ----------
class Node:
    def __init__(self, tag=None, text=None, parent=None):
        self.tag, self.text, self.parent, self.children = tag, text, parent, []


class Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, parent=self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, parent=self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(Node(text=data, parent=self.cur))


def text_of(n):
    if n.text is not None:
        return n.text
    if n.tag in SKIP:
        return ""
    return "".join(text_of(c) for c in n.children)


def clean(s):
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()


def elements(n):
    for c in n.children:
        if c.tag:
            yield c
            yield from elements(c)


def inside(n, tags):
    p = n.parent
    while p is not None:
        if p.tag in tags:
            return True
        p = p.parent
    return False


def own_text(li):
    """Text of a list item without its nested lists."""
    parts = []
    for c in li.children:
        if c.tag in ("ul", "ol"):
            continue
        parts.append(text_of(c))
    return clean("".join(parts))


def is_note(li):
    return bool(NOTE_RE.match(own_text(li)))


def real_lis(n):
    return [e for e in elements(n) if e.tag == "li" and not is_note(e)]


def leaf_total(li):
    """How many individual changes sit under this list item."""
    if is_note(li):
        return 0
    kids = real_lis(li)
    if not kids:
        return 1
    return sum(1 for k in kids if not real_lis(k))


def bold_only(p):
    bold = "".join(text_of(c) for c in p.children if c.tag in ("strong", "b"))
    rest = "".join(text_of(c) for c in p.children if c.tag not in ("strong", "b"))
    return bool(clean(bold)) and not clean(rest)


# ---------- buff / nerf / ability names ----------
DETAIL_CATS = {"Classes", "Races"}
FIX_RE = re.compile(r"^(fixed|fixes|resolved|corrected|addressed)\b|\b(bug|incorrect(?:ly)?|correctly|tooltip|typo|visual effect|sound)\b", re.I)
UP_RE = re.compile(r"\b(increas\w*|rais\w*|improv\w*|boost\w*|extended)\b", re.I)
DOWN_RE = re.compile(r"\b(reduc\w*|lower\w*|decreas\w*|shorten\w*)\b", re.I)
COST_RE = re.compile(r"(mana cost|\bcost\b|cooldown|cast time|casting time|threat)", re.I)
WAS_RE = re.compile(r"\(was ([\d.]+(?:/[\d.]+)*)")
BUFF_PHRASE_RE = re.compile(r"\bnow also\b|\bnow grants\b", re.I)


def first_number(text):
    m = re.search(r"(\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)*)[^\d]*$", text)
    return float(m.group(1).split("/")[0]) if m else None


def classify(line):
    """Best-effort label: buff, nerf, fix or change. Based on wording and (was X) numbers."""
    if FIX_RE.search(line):
        return "fix"
    results = []
    for m in WAS_RE.finditer(line):
        old = float(m.group(1).split("/")[0])
        before = line[max(0, m.start() - 90):m.start()]
        new = first_number(before)
        if new is None or new == old:
            continue
        inverted = bool(COST_RE.search(before[-60:]))
        results.append("buff" if ((new > old) != inverted) else "nerf")
    if results:
        return results[0] if len(set(results)) == 1 else "change"
    if BUFF_PHRASE_RE.search(line):
        return "buff"
    up, down = UP_RE.search(line), DOWN_RE.search(line)
    hit = up or down
    if hit and not (up and down):
        inverted = bool(COST_RE.search(line[max(0, hit.start() - 60):hit.start()]))
        return "buff" if ((hit is up) != inverted) else "nerf"
    return "change"


CLASSES = {"Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior", "Death Knight",
           "Orc", "Tauren", "Troll", "Undead", "Human", "Dwarf", "Gnome", "Night Elf", "Blood Elf", "Draenei"}
LEAD = {"Fixed", "Fixes", "Resolved", "Corrected", "Addressed", "Increased", "Reduced", "Lowered", "Updated", "Changed",
        "Rank", "Ranks", "The", "A", "An", "Now", "All", "Players", "Player", "Pets", "Pet", "Rogue", "Developers",
        "When", "While", "With", "Only", "Both", "If", "Each", "Any", "This", "That", "It", "Its", "Their"}
SOLO = {"Holy", "Fire", "Frost", "Nature", "Shadow", "Arcane", "Physical", "Mana", "Rage", "Energy", "Health", "Intellect",
        "Strength", "Agility", "Stamina", "Spirit", "Melee", "Ranged", "Spell", "Weapon", "Attack", "Power", "Combo",
        "Cooldown", "Manager", "Legacy", "Perk", "Main", "Hand", "Hit", "Critical", "Crowd", "Control"}
EXCLUDE = {"Ranged Attack", "Melee Attack", "Legacy Perk", "Cooldown Manager", "Main Hand", "Off Hand", "Combo Points", "Attack Power", "Spell Power"}
NAME_RE = re.compile(r"[A-Z][A-Za-z'’\-]+(?:(?:\s+(?:of|the|for|an)\s+|\s+)[A-Z][A-Za-z'’\-]+)*")


def extract_names(line, limit=4):
    line = WAS_RE.sub("", line)
    out = []
    for m in NAME_RE.finditer(line):
        words = m.group(0).split()
        while words and (words[0] in LEAD or words[0] in CLASSES or words[0].islower()):
            words.pop(0)
        while words and (words[-1] in LEAD or words[-1].islower()):
            words.pop()
        name = " ".join(words)
        if len(name) < 4 or name in EXCLUDE or name in CLASSES or (len(words) == 1 and words[0] in SOLO):
            continue
        if name not in out:
            out.append(name)
    return out[:limit]


def leaves(li):
    return [e for e in elements(li) if e.tag == "li" and not is_note(e) and not real_lis(e)]


# ---------- parsing ----------
def parse(html):
    b = Builder()
    b.feed(html)
    title = ""
    for e in elements(b.root):
        if e.tag == "h1":
            title = clean(text_of(e))
            break

    entries, cur, cat = [], None, None

    def get_cat(name):
        for c in cur["categories"]:
            if c["name"] == name:
                return c
        c = {"name": name, "count": 0, "groups": {}, "detail": {}}
        cur["categories"].append(c)
        return c

    for e in elements(b.root):
        if e.tag in ("p", "h1", "h2", "h3", "h4", "h5") and not inside(e, {"li"}):
            t = clean(text_of(e))
            m = DATE_RE.match(t)
            if m:
                iso = "%04d-%02d-%02d" % (int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
                cur = {"date": iso, "label": t, "categories": []}
                entries.append(cur)
                cat = None
            elif e.tag in ("h1", "h2"):
                cur, cat = None, None
            elif cur is not None and t and len(t) <= 60 and (e.tag != "p" or bold_only(e)):
                cat = get_cat(t)
        elif e.tag == "ul" and cur is not None and not inside(e, {"ul", "ol"}):
            if cat is None:
                cat = get_cat("General")
            for li in [c for c in e.children if c.tag == "li"]:
                n = leaf_total(li)
                if n == 0:
                    continue
                cat["count"] += n
                name = own_text(li)
                if real_lis(li) and 0 < len(name) <= 40:
                    cat["groups"][name] = cat["groups"].get(name, 0) + n
                    if cat["name"] in DETAIL_CATS:
                        d = cat["detail"].setdefault(name, {"kinds": {}, "changes": {}})
                        for leaf in leaves(li):
                            line = own_text(leaf)
                            kind = classify(line)
                            d["kinds"][kind] = d["kinds"].get(kind, 0) + 1
                            for nm in extract_names(line):
                                d["changes"].setdefault((nm, kind), True)

    out = []
    for en in entries:
        order = {"nerf": 0, "buff": 1, "change": 2, "fix": 3}

        def group_out(c, k, v):
            g = {"name": k, "count": v}
            d = c["detail"].get(k)
            if d:
                g["kinds"] = d["kinds"]
                g["changes"] = [{"name": n, "kind": kd} for (n, kd) in sorted(d["changes"], key=lambda t: order[t[1]])][:16]
            return g

        cats = [{"name": c["name"], "count": c["count"],
                 "groups": [group_out(c, k, v) for k, v in c["groups"].items()]}
                for c in en["categories"] if c["count"] > 0]
        out.append({"date": en["date"], "label": en["label"],
                    "total": sum(c["count"] for c in cats), "categories": cats})
    return title, out, b


def fetch():
    path = os.environ.get("HTML_FILE")
    if path:
        return open(path, encoding="utf-8").read()
    req = urllib.request.Request(SOURCE_URL, headers={
        "User-Agent": "Mozilla/5.0 (compatible; DirtySocksGuildBot/1.0)",
        "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def main():
    try:
        html = fetch()
    except Exception as ex:  # network problems, blocked request, etc.
        print("Could not download the hotfix page:", ex)
        return 1

    title, entries, tree = parse(html)
    if not entries:
        tags = {t: sum(1 for e in elements(tree.root) if e.tag == t) for t in ("p", "ul", "li", "h2", "h3")}
        print("No dated sections found, so hotfixes.json was left unchanged.")
        print("Page title:", title or "(none)", "| tag counts:", tags)
        print("Start of page text:", clean(text_of(tree.root))[:300])
        return 1

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    old, first_run = {}, True
    if os.path.exists(OUT_FILE):
        try:
            old = {e["date"]: e for e in json.load(open(OUT_FILE, encoding="utf-8"))["entries"]}
            first_run = False
        except Exception:
            old, first_run = {}, True

    new_dates = []
    for e in entries:
        prev = old.get(e["date"])
        if prev:
            e["firstSeen"] = prev.get("firstSeen")
        else:
            e["firstSeen"] = None if first_run else now  # no "New" badge for the very first run
            if not first_run:
                new_dates.append(e["date"])

    seen = {e["date"] for e in entries}
    merged = entries + [e for d, e in old.items() if d not in seen]  # keep history if Blizzard trims the page
    merged.sort(key=lambda e: e["date"], reverse=True)

    data = {"generated": now, "source": SOURCE_URL, "title": title, "entries": merged}
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Found %d dated sections (newest: %s); %d new since last run: %s"
          % (len(entries), merged[0]["date"], len(new_dates), ", ".join(new_dates) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
