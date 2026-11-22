"""Turn a Project Gutenberg HTML edition into an ordered list of reading blocks.

Blocks are headings, paragraphs (with poem lines kept) and illustrations (with captions). Page numbers, tables of
contents, drop-cap letter images and the Project Gutenberg header and footer are left out. Every text block keeps
its words in order, each word marked italic or not, so the site can render it and the aligner can time it.

Standard library only; Python 3.9+.
"""
import html
import re
from html.parser import HTMLParser

BLOCK_TAGS = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "blockquote", "dd", "dt", "pre"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
SKIP_CLASSES = re.compile(r"\b(pagenum|pageno|page-num|pagelink|footnote|fnanchor|tnote|transnote|toc|index)\b", re.I)
CAPTION_CLASSES = re.compile(r"\b(caption|illustration-caption|figcaption|imgcaption)\b", re.I)
HEADING_TEXT = re.compile(r"^(chapter|stave|book|part|canto|section|prologue|epilogue|preface|introduction)\b", re.I)


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []          # finished blocks
        self.cur = None           # current text block: {"k", "words": [[text, italic], ...], "lines"}
        self.stack = []           # open tags: (tag, skip, caption, italic)
        self.pending_letter = ""  # a drop-cap letter waiting for the next word
        self.last_img = None

    # --- state helpers ---
    def skipping(self):
        return any(s for _, s, _, _ in self.stack)

    def in_caption(self):
        return any(c for _, _, c, _ in self.stack)

    def italic(self):
        return any(i for _, _, _, i in self.stack)

    def flush(self):
        if self.cur and self.cur["words"]:
            if self.cur["k"] == "cap":
                if self.last_img is not None:
                    cap = " ".join(w for w, _ in self.cur["words"])
                    self.last_img["cap"] = (self.last_img.get("cap", "") + " " + cap).strip()
            else:
                self.blocks.append(self.cur)
        self.cur = None

    def start_block(self, kind):
        self.flush()
        self.cur = {"k": kind, "words": [], "br": []}

    # --- parser callbacks ---
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "") or ""
        skip = bool(SKIP_CLASSES.search(cls)) or tag in ("script", "style") or (tag == "table" and "toc" in cls.lower())
        caption = bool(CAPTION_CLASSES.search(cls)) or tag == "figcaption"
        italic = tag in ("i", "em", "cite")
        if tag in ("br",):
            if self.cur and self.cur["words"]:
                self.cur["br"].append(len(self.cur["words"]))
                self.cur["_space_after"] = True    # a line break separates words
            return
        if tag == "img":
            if self.skipping():
                return
            src = a.get("src", "")
            alt = html.unescape(a.get("alt", "") or "").strip()
            try:
                w = int(re.sub(r"\D", "", a.get("width", "") or "0") or 0)
            except ValueError:
                w = 0
            if re.fullmatch(r"[\"'\u201c\u2018]?[A-Za-z]", alt) and (w and w < 160):
                self.pending_letter = alt          # drop cap: the letter belongs to the next word
                return
            self.flush()
            img = {"k": "img", "src": src, "alt": alt}
            self.blocks.append(img)
            self.last_img = img
            return
        if tag in ("hr",):
            self.flush()
            return
        self.stack.append((tag, skip, caption, italic))
        if tag in BLOCK_TAGS and not self.skipping():
            if caption or self.in_caption():
                self.start_block("cap")
            elif tag in HEADING_TAGS:
                self.start_block("h")
            else:
                self.start_block("p")

    def handle_endtag(self, tag):
        # pop to the matching tag (HTML in the wild is not always well nested)
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
        if tag in BLOCK_TAGS:
            self.flush()

    def handle_data(self, data):
        if self.skipping():
            return
        text = data.replace(" ", " ")
        if not text.strip():
            return
        if self.cur is None:
            self.start_block("cap" if self.in_caption() else "p")
        italic = self.italic()
        tokens = text.split()
        if not tokens:
            return
        joins_previous = not text[0].isspace() and self.cur["words"] and not self.cur.get("_space_after", True)
        for n, tok in enumerate(tokens):
            if self.pending_letter:
                tok = self.pending_letter + tok.lower() if tok.isupper() and len(tok) > 1 else self.pending_letter + tok
                self.pending_letter = ""
            if n == 0 and joins_previous:
                prev = self.cur["words"][-1]
                prev[0] += tok              # "<i>very</i>," → "very,"
                prev[1] = prev[1] and italic
            else:
                self.cur["words"].append([tok, italic])
        self.cur["_space_after"] = text[-1].isspace()


def extract_body(raw_html):
    """The part between the Project Gutenberg START and END markers (the whole document if they are missing)."""
    start = re.search(r"\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*", raw_html, re.I)
    end = re.search(r"\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG", raw_html, re.I)
    a = start.end() if start else 0
    b = end.start() if end else len(raw_html)
    body = raw_html[a:b]
    # The marker usually sits inside an element; drop the dangling remainder of that element.
    return re.sub(r"^[^<]*</[^>]+>", "", body)


def parse_blocks(raw_html):
    p = _Parser()
    p.feed(extract_body(raw_html))
    p.flush()
    out = []
    for b in p.blocks:
        if b["k"] == "img":
            out.append({"k": "img", "src": b["src"], "alt": b["alt"], **({"cap": b["cap"]} if b.get("cap") else {})})
            continue
        words = [[w, bool(i)] for w, i in b["words"] if w]
        if not words:
            continue
        text = " ".join(w for w, _ in words)
        kind = "h" if b["k"] == "h" or (len(words) <= 8 and HEADING_TEXT.match(text) and not text.endswith(",")) else "p"
        block = {"k": kind, "w": words}
        if b["br"] and kind == "p":
            block["br"] = sorted(set(x for x in b["br"] if 0 < x < len(words)))
        out.append(block)
    return out


def norm_word(w):
    """Lowercase letters and digits only: what the aligner compares."""
    w = w.lower().replace("’", "'").replace("‘", "'")
    w = re.sub(r"[^a-z0-9']+", "", w)
    return w.strip("'")


def book_words(blocks):
    """Flatten text blocks into [(block_index, word_index, normalized)], skipping empty normalized words."""
    out = []
    for bi, b in enumerate(blocks):
        if b["k"] == "img":
            continue
        for wi, (w, _) in enumerate(b["w"]):
            n = norm_word(w)
            if n:
                out.append((bi, wi, n))
    return out
