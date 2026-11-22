# Read-Along Classics: product

**The user.** People who want to listen to a classic *and* see the words: English learners following a native
speaker, students with a set text, dyslexic and struggling readers, parents reading along with children, and
listeners who drift without something to look at.

**The painful job.** Following an audiobook in a printed or ebook text means losing your place every few lines.
Free audiobooks (LibriVox) and free texts (Project Gutenberg) exist separately; word-synced read-along is mostly
locked inside paid apps and modern titles.

**The promise.** Pick a classic, press play, and every word lights up as it's read, with the book's original
illustrations. Tap a word to jump there. Free, no sign-up.

**The wedge.** Search: "<book> audiobook with text", "<book> chapter <n> read along". Each chapter is its own page
with the full text, so it answers that query directly; teachers can embed a chapter on a class page (each embed
links back). The word timings are open data, which makes the project citable.

**Why now.** Small speech-recognition models run on a free CI runner fast enough (about 40× real time on a laptop,
roughly 10–20× on a runner) to time a whole novel in minutes, and both sources are public domain.

**Activation metric.** A visitor plays a chapter and the highlight follows for at least a minute (page counts and
playback can be measured once the GoatCounter key is on; per-event tracking is not built yet).

**First revenue event.** A donation through the support link (key 2). Ads are possible only off GitHub Pages.

**The original idea vs. v1.** The note was "turning audiobooks into full visual experiences" (AI-generated scenes).
Generated imagery costs money per book, drifts in character consistency and can't run on a free runner; the
book's own illustrations, synced to the narration, deliver the "watch the book" feeling with no cost and no rights
questions. v1 deliberately doesn't generate images, doesn't host audio, doesn't take uploads of copyrighted books,
and doesn't do accounts.
