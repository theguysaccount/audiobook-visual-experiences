# Decisions

1. **Real illustrations, not generated scenes.** The evaluator's read and the machine loop agree: public-domain
   classics with the original illustrations (Rackham's Alice, Leech's Christmas Carol), synced to LibriVox
   narration. Image generation would need a paid API key, can't run in Actions, and struggles with consistency.
   A consumer site first; a publisher studio service would need licensed modern books (rights blocker).

2. **Word-level sync from speech recognition, aligned to the real text.** faster-whisper (`base.en`, int8, CPU)
   gives word timestamps; the recognized words are aligned to the Gutenberg text (4-gram voting to find the
   passage, difflib for the word alignment, length-weighted interpolation for the rest). Alice matched 95% of words
   directly. The site shows the book's own words, never the recognizer's.

3. **Audio is streamed from the Internet Archive, never re-hosted.** A book is ~70–200 MB of MP3; Pages has a 1 GB
   site limit. LibriVox keeps its files at the Internet Archive, so the player streams `archive.org/download/…`
   (CSP allows only that host for media). The weekly check confirms every audio file still answers.

4. **Gutenberg only from its mirror.** Gutenberg's robot policy forbids automated access to www.gutenberg.org;
   the pipeline uses the PGLAF mirror (gutenberg.pglaf.org) and links readers to the ebook landing page, as
   Gutenberg's permission page asks (no deep links to files). Gutenberg is credited; no permission is needed for
   non-commercial use, and the trademark isn't used to sell anything.

5. **Rights gate in code.** A book is published only if first published in or before the US public-domain cutoff
   (year − 96, recomputed each January), its Gutenberg edition carries the public-domain statement and the LibriVox
   recording is a LibriVox (public-domain) recording. LibriVox readers are credited on every chapter, the book page
   and the embed, with links to their LibriVox project, as LibriVox asks.

6. **Solo readings.** Queue entries use single-reader LibriVox versions for a consistent voice and better recognition.

7. **One page per chapter, text in the HTML.** Search engines and readers get the full chapter text; the player
   is progressive (the browser's own audio controls without JavaScript). Embeds are `noindex`.

8. **Quality gates.** A section must place in the text and match ≥55% of its words; the book ≥75%. Short unread
   blocks inside a section (tables of contents, page furniture) are dropped; a section never ends on the next
   chapter's heading.

9. **Monthly cadence, a year of queue.** 14 books queued (2 at launch). The weekly test restarts the monthly job if
   GitHub skipped it (40-day staleness check).

10. **Name: Read-Along Classics.** Descriptive for search; no domain bought (DNS is handled by the domain rollout session).
