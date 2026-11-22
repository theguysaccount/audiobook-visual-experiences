// Build the real site into a temporary folder and check the output against the data it was built from, so the
// checks hold as books are added.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const booksDir = path.join(ROOT, "data", "books");
const books = fs.existsSync(booksDir) ? fs.readdirSync(booksDir).filter((s) => fs.existsSync(path.join(booksDir, s, "book.json"))) : [];
const cutoff = new Date().getUTCFullYear() - 96;

test("every published book's data is complete, public domain and in time order", { skip: !books.length && "no books yet" }, () => {
  for (const slug of books) {
    const book = JSON.parse(fs.readFileSync(path.join(booksDir, slug, "book.json"), "utf8"));
    assert.ok(book.published <= cutoff, `${slug}: first published ${book.published}, after ${cutoff}`);
    assert.ok(book.readers.length > 0 && book.librivox.url && book.gutenberg.id, `${slug}: credits`);
    assert.ok(book.coverage >= 0.75, `${slug}: alignment quality`);
    for (const s of book.sections) {
      const d = JSON.parse(fs.readFileSync(path.join(booksDir, slug, "sections", `${s.n}.json`), "utf8"));
      const words = d.blocks.filter((b) => b.k !== "img").reduce((a, b) => a + b.w.length, 0);
      assert.equal(d.t.length, words, `${slug} ${s.n}: one time per word`);
      assert.ok(d.t.every((t, i) => i === 0 || t >= d.t[i - 1]), `${slug} ${s.n}: times never go backwards`);
      assert.ok(d.t[d.t.length - 1] <= Math.round(s.duration * 100) + 100, `${slug} ${s.n}: last word inside the recording`);
      assert.match(d.audio, /^https:\/\/archive\.org\/download\/[^/]+\/[^/]+\.mp3$/);
      for (const b of d.blocks.filter((x) => x.k === "img")) assert.ok(fs.existsSync(path.join(booksDir, slug, b.src)), `${slug}: ${b.src} missing`);
    }
  }
});

test("built pages are complete and every internal link resolves", { skip: !books.length && "no books yet" }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ra-build-"));
  try {
    const site = "https://theguysaccount.github.io/audiobook-visual-experiences";
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "build.mjs")], { env: { ...process.env, RA_OUT: out, SITE_URL: site }, stdio: "pipe" });
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const html = walk(out).filter((f) => f.endsWith(".html"));
    const basePath = "/audiobook-visual-experiences/";
    const missing = [];
    let chapters = 0;
    for (const f of html) {
      const s = fs.readFileSync(f, "utf8");
      const rel = path.relative(out, f);
      assert.match(s, /<title>[^<]{10,}<\/title>/, rel);
      assert.match(s, /<meta name="description" content="[^"]{30,}">/, rel);
      assert.match(s, /media-src 'self' https:\/\/archive\.org https:\/\/\*\.archive\.org/, `${rel}: CSP`);
      for (const m of s.matchAll(/<script type="application\/(?:ld\+)?json"[^>]*>([^<]+)<\/script>/g)) JSON.parse(m[1]);
      const times = s.match(/<script type="application\/json" id="times">([^<]+)<\/script>/);
      if (times) {
        chapters++;
        const n = (s.match(/class="w"/g) || []).length;
        assert.equal(n, JSON.parse(times[1]).length, `${rel}: word spans and timings line up`);
      }
      for (const m of s.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
        const p = m[1];
        if (!p.startsWith(basePath)) { missing.push(`${rel}: ${p} outside the site`); continue; }
        let file = path.join(out, p.slice(basePath.length));
        if (p.endsWith("/")) file = path.join(file, "index.html");
        if (!fs.existsSync(file)) missing.push(`${rel}: ${p}`);
      }
    }
    assert.deepEqual(missing.slice(0, 20), []);
    const expected = books.reduce((a, slug) => a + JSON.parse(fs.readFileSync(path.join(booksDir, slug, "book.json"), "utf8")).sections.length, 0);
    assert.equal(chapters, expected * 2, "a chapter page and an embed page per chapter");
    const sitemap = fs.readFileSync(path.join(out, "sitemap.xml"), "utf8");
    assert.equal((sitemap.match(/<loc>/g) || []).length, 2 + books.length + expected, "home, about, books and chapters (embeds are not listed)");
    assert.match(fs.readFileSync(path.join(out, "robots.txt"), "utf8"), /Sitemap: https:\/\/theguysaccount\.github\.io\/audiobook-visual-experiences\/sitemap\.xml/);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test("a custom domain moves every URL with one setting", { skip: !books.length && "no books yet" }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ra-build-"));
  try {
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "build.mjs")], { env: { ...process.env, RA_OUT: out, SITE_URL: "https://readalong.example.org" }, stdio: "pipe" });
    const home = fs.readFileSync(path.join(out, "index.html"), "utf8");
    assert.match(home, /<link rel="canonical" href="https:\/\/readalong\.example\.org\/">/);
    assert.ok(!home.includes("/audiobook-visual-experiences/"));
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
