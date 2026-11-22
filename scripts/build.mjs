// Build the static site into dist/ (or $RA_OUT) from data/books/*: a library page, one page per book, one
// read-along page per chapter (text, illustrations, word timings), embeddable players, open data, sitemap.
//   node scripts/build.mjs
// Environment (optional; GitHub Actions passes repository variables):
//   SITE_URL        public base URL, no trailing slash (default: the github.io project URL). The one setting that
//                   moves the site to a custom domain.
//   RA_SUPPORT_URL  a donation page linked in the footer (off when empty)
//   RA_GOATCOUNTER  https://<code>.goatcounter.com/count for cookieless page counts (off when empty)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_SITE_URL = "https://theguysaccount.github.io/audiobook-visual-experiences";
const SITE_URL = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
const BASE = new URL(SITE_URL + "/").pathname;
const OUT = path.resolve(ROOT, process.env.RA_OUT || "dist");
const SUPPORT_URL = (process.env.RA_SUPPORT_URL || "").trim();
const GOATCOUNTER = (process.env.RA_GOATCOUNTER || "").trim();
const REPO_URL = "https://github.com/theguysaccount/audiobook-visual-experiences";
const NAME = "Read-Along Classics";
const DAY = process.env.RA_TODAY || new Date().toISOString().slice(0, 10);

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (p) => SITE_URL + "/" + String(p).replace(/^\//, "");
const rel = (p) => BASE + String(p).replace(/^\//, "");
const sha = (s, n = 10) => crypto.createHash("sha256").update(s).digest("hex").slice(0, n);
const write = (p, c) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };
export const fmtTime = (sec) => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };
const isoDur = (sec) => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return `PT${h ? h + "H" : ""}${m ? m + "M" : ""}${s}S`; };
const readers = (list) => list.join(" and ");

export function loadBooks(dir = path.join(ROOT, "data", "books")) {
  if (!fs.existsSync(dir)) return [];
  const books = [];
  for (const slug of fs.readdirSync(dir).sort()) {
    const f = path.join(dir, slug, "book.json");
    if (!fs.existsSync(f)) continue;
    const book = JSON.parse(fs.readFileSync(f, "utf8"));
    book.dir = path.join(dir, slug);
    book.chapters = book.sections.map((s) => ({ ...s, data: JSON.parse(fs.readFileSync(path.join(book.dir, "sections", `${s.n}.json`), "utf8")) }));
    books.push(book);
  }
  const order = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "queue.json"), "utf8")).books.map((b) => b.slug);
  return books.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug) || a.slug.localeCompare(b.slug));
}

function shell({ title, description, pathname, body, jsonld = [], og = "og/home.png", noindex = false, bodyClass = "", v, embed = false }) {
  const gcOrigin = GOATCOUNTER ? new URL(GOATCOUNTER).origin : "";
  const csp = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:${gcOrigin ? " " + gcOrigin : ""}; media-src 'self' https://archive.org https://*.archive.org; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; manifest-src 'self'`;
  const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(abs(pathname))}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<meta property="og:type" content="website">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(abs(pathname))}">
<meta property="og:image" content="${esc(abs(og))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#2b2340">
<link rel="icon" href="${rel("favicon.svg")}" type="image/svg+xml">
<link rel="stylesheet" href="${rel(`assets/site.css?v=${v}`)}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body class="${bodyClass}${embed ? " embed" : ""}" data-base="${esc(BASE)}"${GOATCOUNTER ? ` data-gc="${esc(GOATCOUNTER)}"` : ""}>`;
  if (embed) return `${head}\n${body}\n<script type="module" src="${rel(`assets/player.js?v=${v}`)}"></script>\n</body>\n</html>\n`;
  return `${head}
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="${rel("")}"><span class="brand-mark" aria-hidden="true"></span>${NAME}</a>
  <nav aria-label="Main"><a href="${rel("")}">Books</a><a href="${rel("about/")}">How it works</a></nav>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <p>Narration by <a href="https://librivox.org" rel="noopener">LibriVox</a> volunteers: public-domain recordings, streamed from the <a href="https://archive.org" rel="noopener">Internet Archive</a>. Texts and illustrations from <a href="https://www.gutenberg.org" rel="noopener">Project Gutenberg</a>. Word timings made by speech recognition, then matched to the book's own text.</p>
  <p><a href="${rel("about/")}">How it works, rights and privacy</a> · <a href="${REPO_URL}" rel="noopener">Source and open data</a>${SUPPORT_URL ? ` · <a href="${esc(SUPPORT_URL)}" rel="noopener" data-slot="support">Support this free library</a>` : ""}</p>
</footer>
<script type="module" src="${rel(`assets/page.js?v=${v}`)}"></script>
</body>
</html>
`;
}

const chapterPath = (book, ch) => `${book.slug}/${ch.slug}/`;
const coverSrc = (book) => (book.cover ? rel(`${book.slug}/${book.cover}`) : null);

function wordsHtml(block) {
  const br = new Set(block.br || []);
  return block.w.map(([w, it], i) => `${br.has(i) ? "<br>" : ""}<span class="w">${it ? `<i>${esc(w)}</i>` : esc(w)}</span>`).join(" ");
}

function textHtml(book, data) {
  const out = [];
  for (const b of data.blocks) {
    if (b.k === "img") {
      out.push(`<figure class="ill"><img src="${rel(`${book.slug}/${b.src}`)}" alt="${esc(b.alt || "Illustration")}" loading="lazy">${b.cap ? `<figcaption>${esc(b.cap)}</figcaption>` : ""}</figure>`);
    } else if (b.k === "h") out.push(`<h2 class="tx-h">${wordsHtml(b)}</h2>`);
    else out.push(`<p${b.br ? ' class="verse"' : ""}>${wordsHtml(b)}</p>`);
  }
  return out.join("\n");
}

function playerHtml(book, ch, { embed = false } = {}) {
  const i = book.chapters.indexOf(ch);
  const prev = book.chapters[i - 1], next = book.chapters[i + 1];
  return `<div class="player" id="player" data-book="${esc(book.slug)}" data-n="${ch.n}" data-duration="${ch.duration}" data-next="${next ? esc(rel(chapterPath(book, next))) : ""}">
  <audio id="audio" controls preload="none" src="${esc(ch.data.audio)}"></audio>
  <div class="controls" hidden>
    <button type="button" class="ctl play" id="play" aria-label="Play">▶</button>
    <button type="button" class="ctl" id="back" aria-label="Back 10 seconds">−10</button>
    <button type="button" class="ctl" id="fwd" aria-label="Forward 10 seconds">+10</button>
    <span class="clock" id="clock">0:00 / ${fmtTime(ch.duration)}</span>
    <label class="speed">Speed <select id="speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option></select></label>
    <label class="follow"><input type="checkbox" id="follow" checked> Follow along</label>
    ${embed ? "" : `<span class="size"><button type="button" class="ctl small" id="smaller" aria-label="Smaller text">A−</button><button type="button" class="ctl small" id="bigger" aria-label="Larger text">A+</button></span>`}
  </div>
  <div class="progress" id="progress" hidden><div class="bar" id="bar"></div></div>
  <p class="resume" id="resume" hidden></p>
  <button type="button" class="back-to-voice" id="tovoice" hidden>Back to the reader</button>
</div>
<script type="application/json" id="times">${JSON.stringify(ch.data.t)}</script>
${embed ? "" : `<nav class="chapnav" aria-label="Chapters">${prev ? `<a href="${rel(chapterPath(book, prev))}" rel="prev">← ${esc(prev.title)}</a>` : "<span></span>"}<a href="${rel(book.slug + "/")}">All chapters</a>${next ? `<a href="${rel(chapterPath(book, next))}" rel="next">${esc(next.title)} →</a>` : "<span></span>"}</nav>`}`;
}

function chapterPage(book, ch, v) {
  const i = book.chapters.indexOf(ch);
  const title = `${book.title}, ${ch.title}: audiobook with text | ${NAME}`;
  const description = `Listen to ${book.title} by ${book.author}, ${ch.title.toLowerCase().startsWith("chapter") ? ch.title : `part ${i + 1}: ${ch.title}`}, read by ${readers(ch.data.readers)}, with every word highlighted as it's read. Free, ${fmtTime(ch.duration)}.`;
  const next = book.chapters[i + 1];
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="${rel("")}">Books</a> › <a href="${rel(book.slug + "/")}">${esc(book.title)}</a> › <span>${esc(ch.title)}</span></nav>
<article class="reader">
  <header class="ch-head">
    <p class="eyebrow">${esc(book.title)} · ${esc(book.author)} · part ${i + 1} of ${book.chapters.length}</p>
    <h1>${esc(ch.title)}</h1>
    <p class="credit">Read by ${esc(readers(ch.data.readers))} for <a href="${esc(book.librivox.url)}" rel="noopener">LibriVox</a> · ${fmtTime(ch.duration)}</p>
  </header>
  ${playerHtml(book, ch)}
  <div class="layout">
    <div class="text" id="text">
${textHtml(book, ch.data)}
    </div>
    <aside class="picture" id="picture" hidden aria-label="Illustration for this passage"></aside>
  </div>
  ${next ? `<p class="next-big"><a class="btn" href="${rel(chapterPath(book, next))}">Next: ${esc(next.title)} →</a></p>` : `<p class="next-big"><a class="btn" href="${rel("")}">The end. Choose another book</a></p>`}
  <details class="embed-box"><summary>Embed this chapter on your site</summary>
    <p>Paste this where you want the player, for a class page or a reading list. It plays from the Internet Archive and sends nothing to us.</p>
    <textarea readonly rows="3" aria-label="Embed code">&lt;iframe src="${esc(abs(`embed/${book.slug}/${ch.n}/`))}" title="${esc(book.title)}, ${esc(ch.title)} (read-along)" width="100%" height="520" style="border:0" loading="lazy"&gt;&lt;/iframe&gt;</textarea>
  </details>
  <p class="sources">Text: <a href="${esc(book.gutenberg.url)}" rel="noopener">Project Gutenberg ebook #${book.gutenberg.id}</a>${book.illustrator ? `, illustrated by ${esc(book.illustrator)}` : ""}. Audio: <a href="${esc(book.librivox.url)}" rel="noopener">${esc(book.librivox.title)}</a> on LibriVox, <a href="${esc(book.librivox.archive)}" rel="noopener">files at the Internet Archive</a>. Timings: <a href="${rel(`data/${book.slug}/${ch.n}.json`)}">open data</a>.</p>
</article>`;
  const jsonld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Books", item: abs("") },
      { "@type": "ListItem", position: 2, name: book.title, item: abs(book.slug + "/") },
      { "@type": "ListItem", position: 3, name: ch.title, item: abs(chapterPath(book, ch)) }] },
    { "@context": "https://schema.org", "@type": "Chapter", name: ch.title, position: i + 1, url: abs(chapterPath(book, ch)),
      isPartOf: { "@type": "Audiobook", name: book.title, author: { "@type": "Person", name: book.author }, url: abs(book.slug + "/") },
      audio: { "@type": "AudioObject", contentUrl: ch.data.audio, duration: isoDur(ch.duration), encodingFormat: "audio/mpeg" } },
  ];
  return shell({ title, description, pathname: chapterPath(book, ch), body, jsonld, v, bodyClass: "page-chapter", og: book.og || "og/home.png" });
}

function embedPage(book, ch, v) {
  const body = `<div class="embed-wrap"><p class="embed-title"><a href="${esc(abs(chapterPath(book, ch)))}" target="_blank" rel="noopener">${esc(book.title)}: ${esc(ch.title)}</a> · read by ${esc(readers(ch.data.readers))} (LibriVox)</p>
${playerHtml(book, ch, { embed: true })}
<div class="text" id="text">
${textHtml(book, ch.data)}
</div><p class="embed-credit">Public-domain narration from LibriVox, text from Project Gutenberg. <a href="${esc(abs(""))}" target="_blank" rel="noopener">${NAME}</a></p></div>`;
  return shell({ title: `${book.title}, ${ch.title} (read-along player)`, description: `Embeddable read-along player for ${book.title}, ${ch.title}.`, pathname: `embed/${book.slug}/${ch.n}/`, body, v, noindex: true, bodyClass: "page-chapter", embed: true });
}

function bookPage(book, v) {
  const title = `${book.title} audiobook with text, read along free | ${NAME}`;
  const description = `${book.title} by ${book.author}, read by ${readers(book.readers)} (LibriVox). ${book.chapters.length} chapters, ${fmtTime(book.duration)}, with each word highlighted as it's read${book.illustrator ? ` and the original illustrations by ${book.illustrator.replace(/ \(\d+\)$/, "")}` : ""}. Free.`;
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="${rel("")}">Books</a> › <span>${esc(book.title)}</span></nav>
<article class="book">
  <div class="book-head">
    ${coverSrc(book) ? `<img class="cover" src="${coverSrc(book)}" alt="Cover of ${esc(book.title)}" width="220">` : ""}
    <div>
      <h1>${esc(book.title)}</h1>
      <p class="byline">by ${esc(book.author)} · first published ${book.published}${book.illustrator ? ` · illustrated by ${esc(book.illustrator)}` : ""}</p>
      <p class="blurb">${esc(book.blurb)}</p>
      <p class="credit">Read by <strong>${esc(readers(book.readers))}</strong> for LibriVox · ${fmtTime(book.duration)} in ${book.chapters.length} parts</p>
      <p><a class="btn" href="${rel(chapterPath(book, book.chapters[0]))}">Start reading along</a></p>
    </div>
  </div>
  <h2>Chapters</h2>
  <ol class="chapters">${book.chapters.map((c) => `<li><a href="${rel(chapterPath(book, c))}">${esc(c.title)}</a> <span class="meta">${fmtTime(c.duration)}</span></li>`).join("")}</ol>
  <h2>Credits</h2>
  <ul class="credits">
    <li>Narration: ${esc(readers(book.readers))}, <a href="${esc(book.librivox.url)}" rel="noopener">${esc(book.librivox.title)}</a> on LibriVox. LibriVox recordings are in the public domain.</li>
    <li>Audio files: <a href="${esc(book.librivox.archive)}" rel="noopener">Internet Archive</a> (played from there; this site doesn't copy them).</li>
    <li>Text${book.illustrator ? " and illustrations" : ""}: <a href="${esc(book.gutenberg.url)}" rel="noopener">Project Gutenberg ebook #${book.gutenberg.id}</a>. Public domain in the USA.</li>
    <li>Word timings: speech recognition (${esc(book.model)}) matched to the text; ${Math.round(book.coverage * 100)}% of words matched directly, the rest placed between them. <a href="${REPO_URL}/tree/main/data/books/${esc(book.slug)}" rel="noopener">Open data</a>.</li>
  </ul>
</article>`;
  const jsonld = [{ "@context": "https://schema.org", "@type": "Audiobook", name: book.title, url: abs(book.slug + "/"), author: { "@type": "Person", name: book.author },
    readBy: book.readers.map((r) => ({ "@type": "Person", name: r })), duration: isoDur(book.duration), inLanguage: "en", isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: "LibriVox", url: "https://librivox.org" }, copyrightNotice: "Public domain",
    ...(coverSrc(book) ? { image: abs(`${book.slug}/${book.cover}`) } : {}),
    hasPart: book.chapters.map((c, i) => ({ "@type": "Chapter", position: i + 1, name: c.title, url: abs(chapterPath(book, c)) })) }];
  return shell({ title, description, pathname: book.slug + "/", body, jsonld, v, bodyClass: "page-book", og: book.og || "og/home.png" });
}

function homePage(books, v) {
  const totalH = books.reduce((a, b) => a + b.duration, 0) / 3600;
  const body = `
<section class="hero">
  <h1>Classic audiobooks with every word lit up as it's read.</h1>
  <p class="lede">Free public-domain narration from LibriVox, matched word by word to the book's text and its original illustrations. Listen and follow along, tap any word to jump there. No sign-up, no ads.</p>
</section>
<section class="library" aria-labelledby="lib-h">
  <h2 id="lib-h">The library</h2>
  <ul class="shelf">${books.map((b) => `<li class="book-card">
    <a href="${rel(b.slug + "/")}">${coverSrc(b) ? `<img src="${coverSrc(b)}" alt="" loading="lazy">` : `<span class="nocover">${esc(b.title)}</span>`}
    <span class="bc-title">${esc(b.title)}</span></a>
    <span class="bc-meta">${esc(b.author)} · read by ${esc(readers(b.readers))} · ${fmtTime(b.duration)}</span>
  </li>`).join("")}</ul>
  <p class="sub">${books.length} book${books.length === 1 ? "" : "s"}, ${totalH.toFixed(1)} hours. A new classic is added every month.</p>
</section>
<section class="how">
  <h2>How it works</h2>
  <ol class="three">
    <li><strong>Public-domain narration.</strong> Volunteers for LibriVox read the book aloud and give the recording to the public domain. It plays straight from the Internet Archive.</li>
    <li><strong>The book's own text.</strong> The words and illustrations come from a Project Gutenberg edition, so what you read is what was printed.</li>
    <li><strong>Matched word by word.</strong> Speech recognition timed the narration, and every word in the text was matched to it. Tap a word to jump there; the page follows the voice.</li>
  </ol>
  <p>Good for reading practice, for English learners following a native speaker, for students with a set text, and for anyone who'd rather listen and look.</p>
</section>`;
  const jsonld = [{ "@context": "https://schema.org", "@type": "WebSite", name: NAME, url: abs(""), description: "Free public-domain audiobooks synced word by word to their text." },
    { "@context": "https://schema.org", "@type": "ItemList", name: "Read-along audiobooks", itemListElement: books.map((b, i) => ({ "@type": "ListItem", position: i + 1, url: abs(b.slug + "/"), name: b.title })) }];
  return shell({ title: `${NAME}: free audiobooks with the text highlighted as it's read`, description: `Listen to ${books.map((b) => b.title).slice(0, 3).join(", ")} and more, read by LibriVox volunteers, with every word highlighted as it's read and the original illustrations. Free.`, pathname: "", body, jsonld, v, bodyClass: "page-home" });
}

function aboutPage(books, v) {
  const body = `
<article class="guide">
<h1>How Read-Along Classics works</h1>
<h2>Where everything comes from</h2>
<ul>
<li><strong>Narration</strong> is by <a href="https://librivox.org" rel="noopener">LibriVox</a> volunteers. LibriVox recordings are in the public domain; we credit every reader on every page and link to their LibriVox project. The audio plays straight from the <a href="https://archive.org" rel="noopener">Internet Archive</a>, where LibriVox keeps it; this site never copies it.</li>
<li><strong>Texts and illustrations</strong> come from <a href="https://www.gutenberg.org" rel="noopener">Project Gutenberg</a> editions, linked from each book's page. Only books first published in ${new Date(DAY).getUTCFullYear() - 96} or earlier, public domain in the USA, are used.</li>
<li><strong>Word timings</strong> are made by speech recognition running on GitHub's servers. The recognized words are matched to the book's own text; matched words get the narrator's timing, and the few that can't be matched are placed between their neighbours. Each book page says how many words matched directly.</li>
</ul>
<h2>Using the player</h2>
<ul>
<li>Tap any word to jump the narration there. The page follows the reader; scroll away and a button brings you back.</li>
<li>Keyboard: Space to play or pause, ← and → to move 5 seconds.</li>
<li>Your place in each chapter is remembered in this browser only.</li>
</ul>
<h2>Privacy</h2>
<p>No accounts, no cookies, no ads. The pages are static files on GitHub Pages; the audio comes from the Internet Archive, which sees the request like any audio player's. Your reading position is stored only in your browser's local storage.</p>
<h2>Open data</h2>
<p>Every chapter's word timings are published as JSON (linked under each chapter), and the transcripts and pipeline are in the <a href="${REPO_URL}" rel="noopener">repository</a>, free to reuse.</p>
<h2>Corrections</h2>
<p>A word out of sync, or a chapter that stops matching? <a href="${REPO_URL}/issues" rel="noopener">Open an issue</a> with the book, chapter and time.</p>
</article>`;
  return shell({ title: `How it works, rights and privacy | ${NAME}`, description: "Where the narration, texts and word timings come from, how to use the read-along player, and what the site does with your data (nothing).", pathname: "about/", body, v });
}

function copyAssets(v) {
  for (const f of fs.readdirSync(path.join(ROOT, "src"))) {
    const src = path.join(ROOT, "src", f);
    if (fs.statSync(src).isDirectory()) continue;
    if (f.endsWith(".js")) write(`assets/${f}`, fs.readFileSync(src, "utf8").replace(/(from\s+|import\s*\(\s*)(["'])(\.{1,2}\/[^"']+\.js)\2/g, (m, a, q, p) => `${a}${q}${p}?v=${v}${q}`));
    else if (f.endsWith(".css")) write(`assets/${f}`, fs.readFileSync(src));
  }
  write("favicon.svg", fs.readFileSync(path.join(ROOT, "src", "favicon.svg")));
  const og = path.join(ROOT, "src", "og");
  if (fs.existsSync(og)) for (const f of fs.readdirSync(og)) write(`og/${f}`, fs.readFileSync(path.join(og, f)));
}

export function build() {
  const books = loadBooks();
  const h = crypto.createHash("sha256");
  for (const f of fs.readdirSync(path.join(ROOT, "src")).sort()) { const p = path.join(ROOT, "src", f); if (fs.statSync(p).isFile()) h.update(f).update(fs.readFileSync(p)); }
  for (const b of books) h.update(JSON.stringify(b.sections)).update(b.made);
  const v = h.update(SITE_URL).digest("hex").slice(0, 10);
  fs.rmSync(OUT, { recursive: true, force: true });
  copyAssets(v);
  const pages = new Map();
  const add = (p, html, index = true) => { write(p.endsWith(".html") ? p : p + "index.html", html); if (index) pages.set(abs(p), sha(html, 16)); };
  add("", homePage(books, v));
  add("about/", aboutPage(books, v));
  for (const book of books) {
    const ogBook = path.join(ROOT, "src", "og", `${book.slug}.png`);
    if (fs.existsSync(ogBook)) book.og = `og/${book.slug}.png`;
    add(book.slug + "/", bookPage(book, v));
    for (const ch of book.chapters) {
      add(chapterPath(book, ch), chapterPage(book, ch, v));
      add(`embed/${book.slug}/${ch.n}/`, embedPage(book, ch, v), false);
      write(`data/${book.slug}/${ch.n}.json`, JSON.stringify({ book: book.title, chapter: ch.title, audio: ch.data.audio, readers: ch.data.readers, duration: ch.duration, blocks: ch.data.blocks, t: ch.data.t }));
    }
    const imgDir = path.join(book.dir, "img");
    if (fs.existsSync(imgDir)) for (const f of fs.readdirSync(imgDir)) write(`${book.slug}/img/${f}`, fs.readFileSync(path.join(imgDir, f)));
  }
  write("404.html", shell({ title: `Not found | ${NAME}`, description: "This page isn't here. Choose a book from the read-along library.", pathname: "404.html", body: `<section class="guide"><h1>That page isn't here</h1><p><a class="btn" href="${rel("")}">Choose a book</a></p></section>`, v, noindex: true }));
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages.keys()].map((u) => `<url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`);
  write("robots.txt", `User-agent: *\nAllow: /\nDisallow: ${BASE}embed/\n\nSitemap: ${abs("sitemap.xml")}\n`);
  const key = fs.readFileSync(path.join(ROOT, "src", "indexnow-key.txt"), "utf8").trim();
  write(`${key}.txt`, key + "\n");
  write("manifest.json", JSON.stringify({ generated: DAY, v, pages: Object.fromEntries(pages) }) + "\n");
  write("build-info.json", JSON.stringify({ generated: DAY, v, siteUrl: SITE_URL, books: books.map((b) => ({ slug: b.slug, chapters: b.chapters.length, first: chapterPath(b, b.chapters[0]) })) }) + "\n");
  return { books, pages: pages.size, v };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = build();
  console.log(`built ${r.pages} pages for ${r.books.length} books into ${path.relative(ROOT, OUT)}/ (v ${r.v})`);
}
