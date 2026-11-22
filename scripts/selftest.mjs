// End-to-end self-test in headless Chrome, against the local build or the live site:
//   node scripts/selftest.mjs                 serves dist/ the way Pages does (no audio is played)
//   node scripts/selftest.mjs https://…/      tests the live site, including real playback from the Internet Archive
// Checks every book's first and a middle chapter: one timing per word, highlighting follows the clock, tapping a
// word seeks there, illustrations load, the embed works, phone layout has no sideways scroll, no console errors,
// and the pages contact nothing but this site (and the Internet Archive for audio).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./lib/chrome.mjs";
import { createServer } from "./serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "selftest-out");
fs.mkdirSync(OUT, { recursive: true });
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); else console.log("  ok  " + msg); };

let base = process.argv[2], server, info;
const live = !!base;
if (!base) {
  info = JSON.parse(fs.readFileSync(path.join(ROOT, process.env.RA_OUT || "dist", "build-info.json"), "utf8"));
  const bp = new URL(info.siteUrl + "/").pathname;
  server = createServer(bp);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}${bp}`;
}
base = base.replace(/\/?$/, "/");
const origin = new URL(base).origin;
if (!info) info = await (await fetch(base + "build-info.json")).json();
console.log(`self-test against ${base} (${info.books.length} books)`);

const allowed = (u) => u.startsWith(origin + "/") || /^https:\/\/([a-z0-9-]+\.)*archive\.org\//.test(u) || u.startsWith("data:") || u === "about:blank";
const privacy = (page, label) => {
  const bad = page.requests.filter((r) => !allowed(r.url) || r.method !== "GET" || r.hasBody);
  check(!bad.length, `${label}: contacts only this site and the Internet Archive, sends nothing${bad.length ? " (saw " + bad.slice(0, 3).map((r) => r.method + " " + r.url).join(", ") + ")" : ""}`);
  page.requests.length = 0;
};
const noErrors = (page, label) => { check(!page.errors.length, `${label}: no console errors${page.errors.length ? ": " + page.errors.slice(0, 3).join(" | ") : ""}`); page.errors.length = 0; };
const overflow = (page) => page.eval("document.documentElement.scrollWidth - window.innerWidth");

const chrome = await launch();
try {
  const page = await chrome.newPage({ width: 1280, height: 900 });
  await page.goto(base, 400);
  const cards = await page.eval(`[...document.querySelectorAll(".book-card a")].map((a) => a.getAttribute("href"))`);
  check(cards.length === info.books.length, `home lists all ${info.books.length} books`);
  await page.screenshot(path.join(OUT, "desktop-home.png"));
  for (const b of info.books) {
    await page.goto(origin + new URL(base).pathname + b.slug + "/", 200);
    const chapters = await page.eval(`[...document.querySelectorAll(".chapters a")].map((a) => a.href)`);
    check(chapters.length === b.chapters, `${b.slug}: book page lists ${b.chapters} chapters`);
    const sample = [chapters[0], chapters[Math.floor(chapters.length / 2)]];
    for (const url of [...new Set(sample)]) {
      await page.goto(url, 300);
      const st = await page.eval(`({ words: window.__readalong?.words, times: window.__readalong?.times, audio: document.querySelector("#audio")?.getAttribute("src"),
        imgs: [...document.querySelectorAll("#text img")].map((i) => i.getAttribute("src")), h1: document.querySelector("h1")?.textContent })`);
      const label = url.replace(origin, "");
      check(st.words > 50 && st.words === st.times, `${label}: ${st.words} words, one timing each`);
      check(/^https:\/\/archive\.org\/download\/.+\.mp3$/.test(st.audio || ""), `${label}: audio streams from the Internet Archive`);
      // drive the clock without playing: the highlight follows it
      const probe = await page.eval(`(() => { const r = window.__readalong; const t = JSON.parse(document.getElementById("times").textContent);
        const k = Math.floor(t.length * 0.6); r.tick(t[k] / 100 + 0.01); const on = document.querySelectorAll("#text .w.on");
        return { k, cur: r.current(), expected: r.wordAt(t[k] / 100 + 0.01), on: on.length, sent: document.querySelectorAll("#text .w.s").length }; })()`);
      check(probe.cur === probe.expected && probe.on === 1 && probe.sent >= 1, `${label}: highlight follows the clock (word ${probe.cur}, sentence of ${probe.sent} words)`);
      const seek = await page.eval(`(() => { const a = document.getElementById("audio"); a.play = () => Promise.resolve(); const w = document.querySelectorAll("#text .w"); const i = Math.floor(w.length / 3);
        w[i].click(); const t = JSON.parse(document.getElementById("times").textContent)[i] / 100; return { want: t, got: window.__readalong.lastSeek() }; })()`);
      check(Math.abs(seek.want - seek.got) < 0.011, `${label}: tapping a word seeks to it (${seek.got.toFixed(2)} s)`);
      for (const src of st.imgs) {
        const ok = await page.eval(`fetch(${JSON.stringify(new URL(src, url).href)}).then((r) => r.ok)`);
        if (!ok) problems.push(`${label}: illustration missing ${src}`);
      }
      if (st.imgs.length) check(true, `${label}: ${st.imgs.length} illustrations load`);
    }
    await page.screenshot(path.join(OUT, `desktop-${b.slug}.png`));
    // the embed player
    await page.goto(`${base}embed/${b.slug}/1/`, 300);
    check(await page.eval(`window.__readalong?.words > 50 && !document.querySelector("header.top")`), `${b.slug}: embed player works without site chrome`);
  }
  privacy(page, "library, books, chapters and embeds");
  noErrors(page, "library, books, chapters and embeds");
  if (live) {
    // real playback from the Internet Archive for a few seconds
    const first = info.books[0];
    await page.goto(`${base}${first.first}`, 400);
    await page.eval(`document.getElementById("play").click()`);
    try {
      await page.waitFor(`document.getElementById("audio").currentTime > 3`, 45000);
      const r = await page.eval(`({ t: document.getElementById("audio").currentTime, cur: window.__readalong.current() })`);
      check(r.cur >= 0, `live playback from the Internet Archive: ${r.t.toFixed(1)} s played, highlight at word ${r.cur}`);
    } catch (e) { problems.push("live playback did not start within 45 s: " + e.message); }
    await page.eval(`document.getElementById("audio").pause()`);
    privacy(page, "live playback");
    noErrors(page, "live playback");
  }
  await page.goto(base + "about/", 100);
  check(await page.eval(`/How Read-Along Classics works/.test(document.querySelector("h1").textContent)`), "about page renders");
  await page.close();

  const phone = await chrome.newPage({ width: 390, height: 844, mobile: true });
  await phone.goto(base, 300);
  check((await overflow(phone)) <= 1, "phone: home has no sideways scroll");
  await phone.screenshot(path.join(OUT, "phone-home.png"));
  await phone.goto(`${base}${info.books[0].first}`, 400);
  check((await overflow(phone)) <= 1, "phone: chapter page has no sideways scroll");
  await phone.eval(`window.__readalong.tick(JSON.parse(document.getElementById("times").textContent)[40] / 100 + 0.01)`);
  await phone.screenshot(path.join(OUT, "phone-chapter.png"));
  privacy(phone, "phone");
  noErrors(phone, "phone");
  await phone.close();
} catch (e) {
  problems.push("self-test crashed: " + (e.stack || e.message));
} finally {
  await chrome.close();
  server?.close();
}
fs.writeFileSync(path.join(OUT, "report.txt"), problems.length ? problems.join("\n") + "\n" : "all checks passed\n");
if (problems.length) { console.error("\nFAILED:\n" + problems.map((p) => " - " + p).join("\n")); process.exit(1); }
console.log("\nself-test passed");
