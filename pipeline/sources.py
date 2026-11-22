"""Polite access to the three sources: the LibriVox API, the Project Gutenberg mirror and the Internet Archive.

Project Gutenberg allows automated downloads only from its mirrors, never from www.gutenberg.org, so every text
and image comes from gutenberg.pglaf.org (PGLAF's own mirror). Audio is never re-hosted: the site plays it from
the Internet Archive, where LibriVox keeps it; the pipeline downloads a copy only to transcribe it.
"""
import json
import os
import re
import time
import urllib.error
import urllib.request

REPO_URL = "https://github.com/theguysaccount/audiobook-visual-experiences"
UA = "read-along-classics/1.0 (+%s)" % REPO_URL
MIRROR = os.environ.get("RA_GUTENBERG_MIRROR", "https://gutenberg.pglaf.org").rstrip("/")
_last = {}


def _pace(host, seconds):
    wait = _last.get(host, 0) + seconds - time.time()
    if wait > 0:
        time.sleep(wait)
    _last[host] = time.time()


def fetch(url, tries=5, timeout=120, pace=1.5):
    host = url.split("/")[2]
    err = None
    for attempt in range(tries):
        _pace(host, pace)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            err = e
            if e.code in (404, 403, 410):
                raise
        except Exception as e:  # network trouble: retry
            err = e
        time.sleep(min(60, 3 * 2 ** attempt))
    raise RuntimeError("could not fetch %s: %s" % (url, err))


def gutenberg_dir(pg_id):
    """Mirror folder for an ebook number: 11 -> 1/11, 28885 -> 2/8/8/8/28885."""
    s = str(int(pg_id))
    if len(s) == 1:
        return "0/%s" % s
    return "/".join(s[:-1]) + "/" + s


def gutenberg_html(pg_id):
    d = gutenberg_dir(pg_id)
    base = "%s/%s/%s-h/" % (MIRROR, d, pg_id)
    for name in ("%s-h.htm" % pg_id, "%s-h.html" % pg_id):
        try:
            return base, decode_html(fetch(base + name))
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    raise RuntimeError("no HTML edition of Gutenberg #%s on the mirror" % pg_id)


def gutenberg_rights(pg_id):
    """The rights statement from Gutenberg's own catalog record (RDF) on the mirror, e.g. "Public domain in the USA."."""
    rdf = fetch("%s/cache/epub/%d/pg%d.rdf" % (MIRROR, int(pg_id), int(pg_id))).decode("utf-8", errors="replace")
    m = re.search(r"<dcterms:rights>(.*?)</dcterms:rights>", rdf, re.S)
    return m.group(1).strip() if m else ""


def decode_html(data):
    """Older Gutenberg HTML files are ISO-8859-1 or windows-1252; newer ones are UTF-8. Trust the file's own meta."""
    head = data[:3000].decode("ascii", errors="replace").lower()
    m = re.search(r"charset\s*=\s*[\"']?([a-z0-9_-]+)", head)
    enc = (m.group(1) if m else "utf-8").replace("iso-8859-1", "windows-1252")  # browsers read latin-1 as cp1252
    try:
        return data.decode(enc)
    except (LookupError, UnicodeDecodeError):
        return data.decode("utf-8", errors="replace")


def librivox(lv_id):
    url = "https://librivox.org/api/feed/audiobooks/?id=%s&format=json&extended=1" % int(lv_id)
    data = json.loads(fetch(url, pace=2).decode("utf-8"))
    books = data.get("books") or []
    if not books:
        raise RuntimeError("LibriVox has no audiobook %s" % lv_id)
    return books[0]


def download(url, path, tries=4):
    """Stream a large file (an MP3) to disk."""
    url = url.replace("://www.archive.org/", "://archive.org/")
    err = None
    for attempt in range(tries):
        _pace(url.split("/")[2], 2)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            os.replace(path + ".part", path)
            return path
        except Exception as e:
            err = e
            time.sleep(min(60, 5 * 2 ** attempt))
    raise RuntimeError("could not download %s: %s" % (url, err))
