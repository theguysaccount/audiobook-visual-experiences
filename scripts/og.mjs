// Draw Open Graph share cards (1200×630) with headless Chrome: one for the site and one per book (with its cover).
// Run after adding a book; the PNGs are committed in src/og/ and copied into every build.
//   node scripts/og.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./lib/chrome.mjs";
import { loadBooks, fmtTime } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "og");
fs.mkdirSync(OUT, { recursive: true });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const card = (title, line, foot, imgData) => `<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:#2b2340;font-family:Georgia,'Iowan Old Style',serif">
<div style="position:absolute;inset:34px;background:#f8f3e8;border-radius:22px;display:flex;overflow:hidden">
<div style="flex:1;padding:64px 70px;position:relative">
<div style="display:flex;align-items:center;gap:16px;font:700 30px Georgia,serif;color:#221d2b"><span style="display:inline-block;width:40px;height:40px;border-radius:8px;background:linear-gradient(90deg,#2b2340 0 48%,#f2c14e 48%)"></span>Read-Along Classics</div>
<div style="font:700 60px/1.08 Georgia,serif;color:#221d2b;margin-top:48px">${esc(title)}</div>
<div style="font:400 34px/1.3 Georgia,serif;color:#4b3d73;margin-top:18px">${esc(line)}</div>
<div style="position:absolute;left:70px;bottom:52px;font:600 24px system-ui,-apple-system,sans-serif;color:#5f586b">${esc(foot)}</div>
</div>${imgData ? `<div style="width:380px;background:#e9dfc9 url('${imgData}') center/cover no-repeat"></div>` : ""}
</div></body></html>`;
const chrome = await launch();
try {
  const page = await chrome.newPage({ width: 1200, height: 630 });
  const shoot = async (name, html) => {
    await page.goto("data:text/html;charset=utf-8," + encodeURIComponent(html), 400);
    await page.screenshot(path.join(OUT, name));
    console.log("drew og/" + name);
  };
  await shoot("home.png", card("Classic audiobooks with every word lit up as it's read", "Free LibriVox narration, matched word by word to the book.", "Public domain · no sign-up · original illustrations"));
  for (const b of loadBooks()) {
    const cover = b.cover ? path.join(b.dir, b.cover) : null;
    const data = cover && fs.existsSync(cover) ? `data:image/${cover.endsWith(".png") ? "png" : "jpeg"};base64,${fs.readFileSync(cover).toString("base64")}` : null;
    await shoot(`${b.slug}.png`, card(b.title, `by ${b.author}, read by ${b.readers.join(" and ")}`, `Audiobook with text · ${b.sections.length} chapters · ${fmtTime(b.duration)}`, data));
  }
} finally {
  await chrome.close();
}
