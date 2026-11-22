# Operations

Read-Along Classics runs with no human in the loop. This file lists every automated job, how each fails safely,
what to watch, and the keys a human can turn later.

**Live:** https://theguysaccount.github.io/audiobook-visual-experiences/ (GitHub Pages, deployed by Actions from `main`).
**Base URL setting:** the repository variable `SITE_URL` (unset = the github.io URL above). It is the only setting
that moves the site; see key 1.

## Automated jobs

| Job | File | When | What it does | How it fails safely |
|---|---|---|---|---|
| Build, test and deploy | `.github/workflows/deploy.yml` | every push to `main`; dispatched by the monthly book job; by hand | pipeline tests (parser, aligner, rights checks), player tests, data and build tests → build → **browser self-test** (every book's first and a middle chapter: one timing per word, the highlight follows the clock, tapping a word seeks, illustrations load, embeds work, phone layout, no console errors, no contact with anything but this site and the Internet Archive) → deploy (second attempt if Pages stalls) → live check of every page, file and **every chapter's audio at the Internet Archive** → IndexNow for changed pages | A failed test or build stops before `deploy`; the last good site stays live. The live check and IndexNow never roll back. |
| Monthly new book | `.github/workflows/align.yml` | **the 9th of each month, 05:37 UTC** (GitHub may start it hours late); by hand (optionally with a `slug`); dispatched by the weekly self-test when no book was published for 40 days | takes the next entry in `data/queue.json`; checks rights (first published in or before the US public-domain cutoff year, which moves forward every January; the Gutenberg edition must carry its public-domain statement); fetches the LibriVox record and the Gutenberg HTML edition **from the PGLAF mirror** (Gutenberg allows automated downloads only from mirrors); downloads each section's MP3 to the runner, runs speech recognition (faster-whisper `base.en`, CPU) for word timestamps, aligns them to the book text, checks quality; copies the illustrations; runs all tests; commits; dispatches the deploy | A book that fails a content check (rights, a section that can't be placed, under 55% of a section's words matched, or under 75% for the whole book) is never published: its queue entry gets a `skip` reason and the next run moves on. A network or tool failure commits nothing. Failure opens or updates one `ops-alert` issue; the next good run closes it. |
| Weekly self-test | `.github/workflows/selftest.yml` | **Tuesdays 10:47 UTC**; by hand | the browser self-test **against the live site, including a few seconds of real playback from the Internet Archive**; every page, file and audio file; a staleness check that dispatches the monthly book job if the newest book is over 40 days old and books remain queued | Never changes the site. Opens or updates one `site-health` issue on failure; closes it on recovery. |
| Keep-alive | `.github/scripts/keepalive.sh`, in both scheduled workflows | every scheduled run | re-enables workflows GitHub disabled for inactivity (never ones disabled by hand); empty commit if the last commit is 45+ days old | Pushes with `GITHUB_TOKEN` trigger no workflows, so it cannot loop. |

The queue holds 14 books (three published on launch day; the third, Oz, by the monthly job itself): about a year of monthly additions. Every job is safe to
re-run: the book job skips books already published, and re-making a book reuses its saved transcripts.

## What to watch

- **Actions:** https://github.com/theguysaccount/audiobook-visual-experiences/actions (scheduled-run failures are emailed to the account owner).
- **Issues labelled `site-health` or `ops-alert`.**
- **`data/queue.json`:** entries with a `skip` reason were checked and not published (rights or alignment quality).
- **Audio availability:** LibriVox files live at the Internet Archive. If one disappears, the weekly check fails
  and names the file; the fix is to point that book at another LibriVox version (`lv` in the queue) and re-make it.

## Recovering by hand

- Re-make one book: Actions → "Monthly new book" → Run workflow with `slug` (reuses transcripts; only alignment and pages change).
- A bad deploy that passed every test: re-run the last good deploy, or `git revert` and push.
- Locally: `python3 -m venv .venv && .venv/bin/pip install -r requirements-align.txt`, then
  `.venv/bin/python -m pipeline.make_book <slug>`, `npm test`, `node scripts/build.mjs`, `node scripts/selftest.mjs`.

## Keys Jack can turn later

### 1. A custom domain (the "domain rollout" session does this)

The site reads its address from one setting, the repository variable `SITE_URL`. Use a domain or subdomain that
serves nothing today: never point a name that already serves a site here, because that would replace it. If the apex
is in use, take a subdomain, as Startups 101 did with `learn.startupcollege.io`. Moving it:

1. DNS: for an apex domain, four `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
   `185.199.111.153`, four `AAAA` → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`,
   `2606:50c0:8003::153`, and `CNAME www` → `theguysaccount.github.io`; for a subdomain, one `CNAME` → `theguysaccount.github.io`.
2. `gh variable set SITE_URL --body https://<domain> --repo theguysaccount/audiobook-visual-experiences`
3. `gh api -X PUT repos/theguysaccount/audiobook-visual-experiences/pages -f cname=<domain>`
4. `gh workflow run deploy.yml --repo theguysaccount/audiobook-visual-experiences` (2–4 back to back).
5. After the certificate is issued: `gh api -X PUT repos/theguysaccount/audiobook-visual-experiences/pages -F https_enforced=true`.
6. About 20 minutes later, send every page to IndexNow once. A new host answers 403 at first, and later deploys send
   only changed pages:
   `curl -s https://<domain>/sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//' > urls.txt && SITE_URL=https://<domain> node scripts/indexnow.mjs --file urls.txt`

Every canonical URL, the sitemap, robots.txt, embeds and asset paths move with it (a test builds for a root domain).
Embeds already pasted on other sites keep working: GitHub redirects the old github.io URLs.

### 2. Money

Pages is non-commercial, so there are no ads. Two options:
- **Donations (fine on Pages):** `gh variable set RA_SUPPORT_URL --body <GitHub Sponsors or donation page> --repo theguysaccount/audiobook-visual-experiences`, then redeploy. The footer shows "Support this free library". LibriVox itself welcomes donations; linking to theirs is also an option.
- **Display ads:** only after moving to a host that allows commercial use (Cloudflare Pages: build `node scripts/build.mjs`, output `dist`, variable `SITE_URL`). Ads would need an ad account and a CSP change in `scripts/build.mjs` (`script-src`, `img-src`, `frame-src` for the ad network); keep them off chapter text so reading isn't interrupted.

### 3. Analytics (cookieless)

Create a GoatCounter site, then `gh variable set RA_GOATCOUNTER --body https://<code>.goatcounter.com/count --repo theguysaccount/audiobook-visual-experiences` and redeploy. Page counts only, skipped under Do Not Track or Global Privacy Control.

### 4. Content routine (more books, better matches)

Adding books needs no AI writing, only queue entries. A quarterly Claude Code routine keeps the queue full:

> In theguysaccount/audiobook-visual-experiences, run `python3 -m tools.find_candidates "<Author>|<Title regex>"` for
> 6 well-known public-domain books not yet in data/queue.json (children's classics, school set texts, short novels
> first). Add one entry each with a solo LibriVox reading whose text source is a Project Gutenberg HTML edition
> (illustrated where the mirror has images), a one-sentence spoiler-free blurb, and the first publication year.
> Run `npm test` and open a pull request.

### 5. Search Console

Verify the domain in Google Search Console with a DNS `TXT` record once a custom domain exists and submit
`/sitemap.xml`. IndexNow engines are notified on every deploy; the account's host-root robots.txt lists the sitemap.

## Configuration reference

| Variable | Where | Effect |
|---|---|---|
| `SITE_URL` | repo variable | public base URL; default `https://theguysaccount.github.io/audiobook-visual-experiences` |
| `RA_SUPPORT_URL` | repo variable | footer donation link (off when empty) |
| `RA_GOATCOUNTER` | repo variable | cookieless page counts (off when empty) |
| `RA_MODEL` | workflow env | speech recognition model (`base.en`) |
| `RA_GUTENBERG_MIRROR` | env | Gutenberg mirror (default `https://gutenberg.pglaf.org`) |
| `RA_TODAY`, `RA_OUT`, `RA_THREADS` | env, local | build date; build folder; recognition threads |
