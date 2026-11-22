"""List solo English LibriVox recordings of given titles whose text source is a Project Gutenberg ebook, with the
mirror's illustration count. Used by hand (or by the content routine) to add books to data/queue.json.
    python3 -m tools.find_candidates "Author Surname|Title regex" ...
"""
import json
import re
import sys
import urllib.parse

from pipeline import sources

for arg in sys.argv[1:]:
    author, title_re = arg.split("|", 1)
    url = "https://librivox.org/api/feed/audiobooks/?author=%s&format=json&extended=1&limit=300" % urllib.parse.quote(author)
    try:
        books = json.loads(sources.fetch(url, pace=2).decode("utf-8")).get("books", [])
    except Exception as e:
        print("!!", author, e)
        continue
    for b in books:
        if b.get("language") != "English" or not re.search(title_re, b["title"], re.I):
            continue
        readers = sorted({r.get("display_name") or "" for s in b.get("sections", []) for r in s.get("readers", [])} - {""})
        m = re.search(r"gutenberg\.org/(?:etext|ebooks|files)/(\d+)", b.get("url_text_source") or "")
        if len(readers) != 1 or not m:
            continue
        print("%-6s %-62s %-9s sec=%-3d pg=%-6s reader=%s" % (b["id"], b["title"][:62], b.get("totaltime"), len(b.get("sections", [])), m.group(1), readers[0]))
