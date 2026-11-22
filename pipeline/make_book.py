"""Make one read-along book: LibriVox narration word-synced to a Project Gutenberg edition, with its illustrations.

    python -m pipeline.make_book <slug>            # a book from data/queue.json
    python -m pipeline.make_book --next            # the first queued book not yet published
    options: --reuse-transcripts (skip speech recognition when transcripts exist), --model base.en

Writes data/books/<slug>/: book.json (metadata, credits, sections, quality), sections/<n>.json (the text blocks
and one start time per word, in centiseconds), transcripts/<n>.json (recognized words with times; open data) and
img/ (illustrations copied from the Gutenberg mirror). Nothing is written for a book that fails a check: rights,
missing sources or poor alignment leave the queue entry marked with the reason instead.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile

from . import sources
from .align import BookIndex, align
from .textparse import book_words, parse_blocks

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
MIN_SECTION_COVERAGE = 0.55
MIN_BOOK_COVERAGE = 0.75
MAX_IMAGE_BYTES = 1_500_000


def today():
    return os.environ.get("RA_TODAY") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def us_public_domain_cutoff(year=None):
    """Works first published in or before this year are in the US public domain (95-year term, January 1)."""
    year = year or int(today()[:4])
    return year - 96


def load_queue():
    with open(os.path.join(DATA, "queue.json"), encoding="utf-8") as f:
        return json.load(f)


def save_queue(q):
    with open(os.path.join(DATA, "queue.json"), "w", encoding="utf-8") as f:
        json.dump(q, f, indent=1, ensure_ascii=False)
        f.write("\n")


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "").replace("’", "")).strip("-")
    return s[:60].strip("-")


def section_title(raw, n, overrides=None):
    if overrides and str(n) in overrides:
        return overrides[str(n)]
    t = re.sub(r"^\s*\d+\s*(?:[-–.:]\s*|\s+)", "", raw or "").strip()
    return t or "Part %d" % n


def check_rights(entry, raw_html, rights_statement):
    """Publish only books first published in or before the US public-domain cutoff whose Gutenberg catalog record
    says "Public domain in the USA", and whose edition carries no copyright marker."""
    cutoff = us_public_domain_cutoff()
    if int(entry["published"]) > cutoff:
        return "first published %s, after the US public-domain cutoff (%s)" % (entry["published"], cutoff)
    if "public domain in the usa" not in (rights_statement or "").lower():
        return "Gutenberg's catalog record does not say public domain in the USA (%r)" % (rights_statement or "")[:80]
    text = raw_html.lower()
    if "copyrighted project gutenberg" in text or "this ebook is copyrighted" in text:
        return "the Gutenberg edition is marked as copyrighted"
    return None


def times_for_blocks(blocks, bw, first, last, times, hits=None):
    """One start time (centiseconds) per word of each text block in the span, and the list of blocks shown.
    Short blocks inside the span that the narrator skipped (a table of contents, page furniture) are left out,
    and so is an illustration surrounded only by skipped blocks."""
    pos_of = {}
    for p, (bi, wi, _) in enumerate(bw):
        pos_of[(bi, wi)] = p
    b0, b1 = bw[first][0], bw[last][0]
    # Don't end a section on the heading of the next chapter ("end of chapter one" often matches "CHAPTER II").
    if blocks[b1]["k"] == "h" and b1 > b0:
        last_pos_in_b1 = [p for (bi, wi), p in pos_of.items() if bi == b1]
        if last_pos_in_b1 and min(last_pos_in_b1) == last:
            b1 -= 1
            while b1 > b0 and blocks[b1]["k"] == "img":
                b1 -= 1
    hit_blocks = {}
    for p in (hits or ()):
        hit_blocks[bw[p][0]] = hit_blocks.get(bw[p][0], 0) + 1
    skip = set()
    if hits is not None:
        for bi in range(b0 + 1, b1):
            b = blocks[bi]
            if b["k"] != "img" and not hit_blocks.get(bi) and len(b["w"]) <= 12:
                skip.add(bi)
        for bi in range(b0 + 1, b1):
            if blocks[bi]["k"] != "img":
                continue
            prev = next((j for j in range(bi - 1, b0 - 1, -1) if blocks[j]["k"] != "img"), None)
            nxt = next((j for j in range(bi + 1, b1 + 1) if blocks[j]["k"] != "img"), None)
            if prev in skip and (nxt is None or nxt in skip):
                skip.add(bi)
    shown, flat = [], []
    t_first = times[0]
    t_last = times[-1]
    prev = t_first
    for bi in range(b0, b1 + 1):
        if bi in skip:
            continue
        b = blocks[bi]
        if b["k"] == "img":
            shown.append(b)
            continue
        shown.append(b)
        for wi in range(len(b["w"])):
            p = pos_of.get((bi, wi))
            if p is None or p < first:
                t = prev if p is None else t_first
            elif p > last:
                t = t_last
            else:
                t = times[p - first]
            t = max(t, prev)
            flat.append(int(round(t * 100)))
            prev = t
    return shown, flat


def transcribe_all(entry, lv, workdir, reuse, model_name):
    from .transcribe import Transcriber  # needs faster-whisper; only imported when recognition runs
    tdir = os.path.join(DATA, "books", entry["slug"], "transcripts")
    os.makedirs(tdir, exist_ok=True)
    model = None
    out = []
    for s in lv["sections"]:
        n = int(s["section_number"])
        path = os.path.join(tdir, "%d.json" % n)
        if reuse and os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                out.append(json.load(f))
            continue
        mp3 = os.path.join(workdir, "%d.mp3" % n)
        print("  downloading section %d" % n, flush=True)
        sources.download(s["listen_url"], mp3)
        if model is None:
            model = Transcriber(model_name)
        print("  transcribing section %d (%s s)" % (n, s.get("playtime")), flush=True)
        words, duration = model.words(mp3)
        rec = {"n": n, "duration": round(duration, 2), "model": model_name, "words": words}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(rec, f, separators=(",", ":"))
        os.remove(mp3)
        out.append(rec)
    return out


def make(entry, reuse=False, model_name="base.en"):
    slug = entry["slug"]
    print("== %s" % entry["title"], flush=True)
    lv = sources.librivox(entry["lv"])
    readers = sorted({r["display_name"] for s in lv["sections"] for r in s.get("readers", [])})
    base_url, raw = sources.gutenberg_html(entry["pg"])
    problem = check_rights(entry, raw, sources.gutenberg_rights(entry["pg"]))
    if problem:
        return {"ok": False, "reason": problem}
    blocks = parse_blocks(raw)
    bw = book_words(blocks)
    index = BookIndex([n for _, _, n in bw])
    workdir = tempfile.mkdtemp(prefix="readalong-")
    try:
        transcripts = transcribe_all(entry, lv, workdir, reuse, model_name)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    out_dir = os.path.join(DATA, "books", slug)
    sec_dir = os.path.join(out_dir, "sections")
    os.makedirs(sec_dir, exist_ok=True)
    start_at = 0
    sections, coverages, images = [], [], {}
    for s, tr in zip(lv["sections"], transcripts):
        n = int(s["section_number"])
        r = align(index, tr["words"], start_at)
        if not r:
            return {"ok": False, "reason": "section %d could not be placed in the text" % n}
        span = r["last"] - r["first"] + 1
        coverage = r["matched"] / max(1, span)
        coverages.append(coverage)
        if coverage < MIN_SECTION_COVERAGE:
            return {"ok": False, "reason": "section %d matched only %.0f%% of its text" % (n, coverage * 100)}
        shown, flat = times_for_blocks(blocks, bw, r["first"], r["last"], r["times"], r["hits"])
        start_at = r["last"] + 1
        for b in shown:
            if b["k"] == "img":
                images[b["src"]] = True
        title = section_title(s.get("title"), n, entry.get("titles"))
        rec = {
            "n": n, "title": title, "audio": s["listen_url"].replace("://www.archive.org/", "://archive.org/"),
            "duration": tr["duration"], "readers": [r_["display_name"] for r_ in s.get("readers", [])],
            "coverage": round(coverage, 3),
            "blocks": [{"k": "img", "src": "img/" + os.path.basename(b["src"]), "alt": b.get("alt", ""), **({"cap": b["cap"]} if b.get("cap") else {})}
                       if b["k"] == "img" else {k: v for k, v in b.items() if k in ("k", "w", "br")} for b in shown],
            "t": flat,
        }
        with open(os.path.join(sec_dir, "%d.json" % n), "w", encoding="utf-8") as f:
            json.dump(rec, f, separators=(",", ":"), ensure_ascii=False)
        sections.append({"n": n, "title": title, "slug": "%d-%s" % (n, slugify(title)), "duration": tr["duration"], "coverage": round(coverage, 3), "words": len(flat)})
        print("  section %d: %d words, %.0f%% matched" % (n, len(flat), coverage * 100), flush=True)
    avg = sum(coverages) / len(coverages)
    if avg < MIN_BOOK_COVERAGE:
        return {"ok": False, "reason": "average match %.0f%% is below %d%%" % (avg * 100, MIN_BOOK_COVERAGE * 100)}
    img_dir = os.path.join(out_dir, "img")
    os.makedirs(img_dir, exist_ok=True)
    keep = {os.path.basename(src) for src in images} | ({os.path.basename(entry["cover"])} if entry.get("cover") else set())
    for f in os.listdir(img_dir):
        if f not in keep:
            os.remove(os.path.join(img_dir, f))
    for src in images:
        dest = os.path.join(img_dir, os.path.basename(src))
        if not os.path.exists(dest):
            data = sources.fetch(base_url + src)
            if len(data) <= MAX_IMAGE_BYTES:
                with open(dest, "wb") as f:
                    f.write(data)
    book = {
        "slug": slug, "title": entry["title"], "author": entry["author"], "published": entry["published"],
        "illustrator": entry.get("illustrator"), "blurb": entry.get("blurb", ""),
        "readers": readers, "librivox": {"id": int(lv["id"]), "url": lv.get("url_librivox"), "archive": (lv.get("url_iarchive") or "").replace("://www.archive.org/", "://archive.org/"), "title": lv.get("title")},
        "gutenberg": {"id": int(entry["pg"]), "url": "https://www.gutenberg.org/ebooks/%d" % int(entry["pg"])},
        "duration": round(sum(s["duration"] for s in sections), 1), "coverage": round(avg, 3), "model": model_name,
        "made": today(), "sections": sections,
        "cover": entry.get("cover") and "img/" + os.path.basename(entry["cover"]),
    }
    if entry.get("cover"):
        dest = os.path.join(img_dir, os.path.basename(entry["cover"]))
        if not os.path.exists(dest):
            with open(dest, "wb") as f:
                f.write(sources.fetch(base_url + entry["cover"]))
    with open(os.path.join(out_dir, "book.json"), "w", encoding="utf-8") as f:
        json.dump(book, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return {"ok": True, "coverage": avg}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?")
    ap.add_argument("--next", action="store_true")
    ap.add_argument("--reuse-transcripts", action="store_true")
    ap.add_argument("--model", default=os.environ.get("RA_MODEL", "base.en"))
    a = ap.parse_args(argv)
    q = load_queue()
    if a.next:
        todo = [e for e in q["books"] if not os.path.exists(os.path.join(DATA, "books", e["slug"], "book.json")) and not e.get("skip")]
        if not todo:
            print("queue is empty: every queued book is published")
            return 0
        entry = todo[0]
    else:
        entry = next((e for e in q["books"] if e["slug"] == a.slug), None)
        if not entry:
            print("no queue entry %r" % a.slug)
            return 2
    result = make(entry, reuse=a.reuse_transcripts, model_name=a.model)
    if not result["ok"]:
        entry["skip"] = result["reason"]
        entry["checked"] = today()
        save_queue(q)
        shutil.rmtree(os.path.join(DATA, "books", entry["slug"], "sections"), ignore_errors=True)
        print("NOT PUBLISHED: %s: %s" % (entry["title"], result["reason"]))
        return 3
    print("published %s (%.0f%% of words matched)" % (entry["title"], result["coverage"] * 100))
    return 0


if __name__ == "__main__":
    sys.exit(main())
