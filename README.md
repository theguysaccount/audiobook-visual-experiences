# Read-Along Classics

**Free classic audiobooks with every word highlighted as it's read.**

Live: https://theguysaccount.github.io/audiobook-visual-experiences/

Public-domain narration by [LibriVox](https://librivox.org) volunteers, streamed from the Internet Archive, matched
word by word to the text and original illustrations of a [Project Gutenberg](https://www.gutenberg.org) edition.
One page per chapter: the text follows the voice, tapping a word jumps there, the latest illustration sits beside
the text on wide screens, and any chapter can be embedded on another site. A new book is added every month.

## How the timings are made

1. `pipeline/make_book.py` takes the next book from `data/queue.json`, checks it's public domain in the USA, fetches
   the LibriVox record and the Gutenberg HTML edition from the PGLAF mirror (Gutenberg allows automated downloads
   only from mirrors).
2. Each section's MP3 is downloaded to the runner and transcribed with word timestamps (`pipeline/transcribe.py`,
   faster-whisper `base.en` on CPU).
3. `pipeline/align.py` finds where each recording sits in the book (shared word 4-grams), aligns the recognized words
   to the book's own words, and gives every book word a start time (direct matches keep the narrator's timing;
   the rest are placed between them).
4. The book is published only if every section places and at least 75% of words match directly.

Output per chapter: `data/books/<slug>/sections/<n>.json` (text blocks, illustrations, one start time per word,
centiseconds) and `transcripts/<n>.json`. Both are open data (CC0).

## Run, test, deploy

Needs Python 3.9+, Node 22+ and Google Chrome (for the browser test).

```bash
npm test                               # pipeline (Python) and player/build (Node) tests
node scripts/build.mjs                 # build into dist/
node scripts/serve.mjs 4862            # http://127.0.0.1:4862/audiobook-visual-experiences/
node scripts/selftest.mjs              # browser test of the build (or pass the live URL to include playback)
python3 -m venv .venv && .venv/bin/pip install faster-whisper==1.2.1
.venv/bin/python -m pipeline.make_book --next   # make the next queued book locally
```

Deploy: push to `main`. Actions tests, builds, runs the browser test and deploys to GitHub Pages. The monthly job
makes the next book; the weekly job tests the live site with real playback. See `OPERATIONS.md`.

## Credits

Narration: LibriVox volunteers (credited on every page). Texts and illustrations: Project Gutenberg. Audio hosting:
the Internet Archive. Speech recognition: faster-whisper (MIT) with OpenAI's Whisper model weights (MIT).
