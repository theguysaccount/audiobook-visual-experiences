# Launch

- Live: https://theguysaccount.github.io/audiobook-visual-experiences/ (GitHub Pages). Production deploy = push to
  `main`; tests and the browser self-test gate every deploy.
- Custom domain: one repository variable (`SITE_URL`), the Pages custom-domain setting and DNS records
  (OPERATIONS.md, key 1). DNS changes belong to the domain rollout session.

## Distribution (machine channels only)

Running now:
- **Pages that answer searches:** one page per chapter with the full text and player ("Alice in Wonderland chapter 7
  audiobook with text"), one per book ("A Christmas Carol audiobook with text, read along free"), structured data
  (Audiobook, Chapter, AudioObject, BreadcrumbList).
- **Embeds:** every chapter has an iframe snippet; each embed links back to the full chapter.
- **Open data:** word timings and transcripts (CC0) in the repository and at `/data/<book>/<n>.json`.
- **Sitemap, robots.txt, canonical URLs, Open Graph cards per book, IndexNow** on every deploy; the account's
  host-root robots.txt lists the sitemap daily.
- **A new book every month** (fresh pages for the crawlers).

Search terms: "<title> audiobook with text", "<title> read along", "<title> chapter <n> audio", "free audiobook with
highlighted text", "read along audiobooks for ESL", "A Christmas Carol audiobook with text" (seasonal, December).

## First 1,000 users (what a human could add; nothing here is sent or posted)

Teachers (ESL and middle-school English) are the natural first audience: an embeddable, free, ad-free chapter
player fits class pages. Communities a human might tell later: r/ESL, r/EnglishLearning, r/Teachers,
r/audiobooks, LibriVox's own forum (they like hearing how recordings are used). Draft only; send nothing.

## 14-day calendar (machine)

- Day 0: deploy with Alice, A Christmas Carol and The Wonderful Wizard of Oz; IndexNow for every page; host-root rebuild.
- Weekly: live self-test with playback.
- Day 9 of each month: next book from the queue (December: Through the Looking-Glass).
