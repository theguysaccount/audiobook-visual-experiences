"""Align a narration transcript (words with timestamps) to the book's own text.

The transcript comes from speech recognition, so it has mistakes, and the narrator adds words that aren't in the
book (the LibriVox introduction, "end of chapter one"). We only use it to time the book's words:

1. locate:  vote on where in the book this recording is, using word 4-grams shared by both;
2. match:   align the transcript to that stretch of the book with difflib (longest common runs);
3. trim:    drop isolated matches at the edges (an introduction that happens to share words with a title page);
4. time:    matched book words take the transcript's time; the rest are interpolated by length.

Standard library only; Python 3.9+.
"""
from bisect import bisect_left
from collections import Counter, defaultdict
from difflib import SequenceMatcher

from .textparse import norm_word

GRAM = 4


def _grams(tokens):
    return [tuple(tokens[i:i + GRAM]) for i in range(len(tokens) - GRAM + 1)]


class BookIndex:
    """4-gram positions over the whole book's normalized words."""

    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = defaultdict(list)
        for i, g in enumerate(_grams(tokens)):
            self.pos[g].append(i)

    def locate(self, said, start_at=0, bucket=80):
        """Best guess of the book position where `said` (normalized transcript words) begins, at or after start_at."""
        votes = Counter()
        for j, g in enumerate(_grams(said)):
            hits = self.pos.get(g)
            if not hits or len(hits) > 6:      # missing, or too common to be informative
                continue
            for i in hits:
                if i + 40 >= start_at:
                    votes[(i - j) // bucket] += 1
        if not votes:
            return None
        best, n = max(votes.items(), key=lambda kv: (kv[1], -kv[0]))
        if n < 3:
            return None
        return max(start_at, best * bucket)


def _trim(pairs, gap=40, min_run=6):
    """Remove matches at either end that are separated from the main body by a long stretch of unmatched text."""
    if not pairs:
        return pairs
    # split into clusters by gaps in book position
    clusters, cur = [], [pairs[0]]
    for p in pairs[1:]:
        if p[0] - cur[-1][0] > gap:
            clusters.append(cur)
            cur = [p]
        else:
            cur.append(p)
    clusters.append(cur)
    big = [c for c in clusters if len(c) >= min_run]
    if not big:
        return max(clusters, key=len)
    first = clusters.index(big[0])
    last = clusters.index(big[-1])
    return [p for c in clusters[first:last + 1] for p in c]


def align(index, transcript, start_at=0):
    """Align one recording.

    index:      BookIndex over the book's normalized words
    transcript: list of [start_seconds, end_seconds, word]
    start_at:   book position where this recording may begin (the previous section's end)

    Returns {"first", "last", "times", "matched", "said"} where first/last are book positions (inclusive), times
    holds a start time in seconds for every book position from first to last, matched is how many book words in
    the span were matched directly, and said is how many transcript words there were.
    """
    said_raw = [(s, e, norm_word(w)) for s, e, w in transcript]
    said_raw = [x for x in said_raw if x[2]]
    said = [w for _, _, w in said_raw]
    if len(said) < 8:
        return None
    where = index.locate(said, start_at)
    if where is None:
        return None
    lo = max(start_at, where - 300)
    hi = min(len(index.tokens), where + int(len(said) * 1.3) + 400)
    window = index.tokens[lo:hi]
    sm = SequenceMatcher(None, window, said, autojunk=False)
    pairs = []
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            pairs.append((lo + a + k, b + k))
    pairs = _trim(pairs)
    if len(pairs) < 8:
        return None
    first, last = pairs[0][0], pairs[-1][0]
    known = {bi: said_raw[tj][0] for bi, tj in pairs}
    times = interpolate(index.tokens, first, last, known, end_time=said_raw[pairs[-1][1]][1])
    return {"first": first, "last": last, "times": times, "matched": len(pairs), "said": len(said), "hits": set(known)}


def interpolate(tokens, first, last, known, end_time):
    """Start times for every position first..last. Unknown positions are spread between known neighbours in
    proportion to word length (longer words take longer to say)."""
    keys = sorted(k for k in known if first <= k <= last)
    out = []
    for pos in range(first, last + 1):
        if pos in known:
            out.append(known[pos])
            continue
        i = bisect_left(keys, pos)
        prev_k = keys[i - 1] if i > 0 else None
        next_k = keys[i] if i < len(keys) else None
        if prev_k is None:
            out.append(known[next_k])
            continue
        t0 = known[prev_k]
        t1 = known[next_k] if next_k is not None else end_time
        span = range(prev_k, next_k if next_k is not None else last + 1)
        weights = [len(tokens[p]) + 2 for p in span]
        before = sum(weights[: pos - prev_k])
        out.append(t0 + (t1 - t0) * before / max(1, sum(weights)))
    # times must never go backwards (recognition sometimes stamps a repeated word early)
    for i in range(1, len(out)):
        if out[i] < out[i - 1]:
            out[i] = out[i - 1]
    return out
