// Check the live site: every page in the sitemap answers 200, every internal file it uses exists, and every
// chapter's audio still answers at the Internet Archive (a ranged request for the first kilobyte, so nothing big
// is downloaded). Exits 1 with a list of what is broken.
//   node scripts/linkcheck.mjs https://owner.github.io/audiobook-visual-experiences
const base = (process.argv[2] || process.env.SITE_URL || "").replace(/\/$/, "");
if (!base) throw new Error("usage: linkcheck.mjs <base url>");
const origin = new URL(base).origin;
const UA = "read-along-classics-linkcheck (+https://github.com/theguysaccount/audiobook-visual-experiences)";
const problems = [];
const seen = new Map();

async function get(url, { text = false, range = false } = {}) {
  const key = url + (range ? "#range" : "");
  if (seen.has(key) && !text) return seen.get(key);
  let res, body = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000), headers: { "user-agent": UA, ...(range ? { range: "bytes=0-1023" } : {}) } });
      if (text) body = await res.text(); else await res.arrayBuffer();
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) { res = { status: 0, statusText: e.message, headers: new Headers() }; }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  const out = { status: res.status, type: res.headers.get("content-type") || "", body };
  seen.set(key, out);
  return out;
}

const sm = await get(base + "/sitemap.xml", { text: true });
if (sm.status !== 200) { console.error("sitemap missing:", sm.status); process.exit(1); }
const pages = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const refs = new Set([base + "/robots.txt", base + "/favicon.svg", base + "/build-info.json"]);
const audio = new Set();
for (const p of pages) {
  const r = await get(p, { text: true });
  if (r.status !== 200) { problems.push(`${r.status} ${p}`); continue; }
  for (const m of r.body.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    let u = m[1].replace(/&amp;/g, "&");
    if (u.startsWith("/")) u = origin + u;
    if (/^https:\/\/archive\.org\/download\/.+\.mp3$/.test(u)) { audio.add(u); continue; }
    if (u.startsWith(base + "/")) refs.add(u.split("?")[0]);
  }
}
const list = [...refs];
for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(async (u) => { const r = await get(u); if (r.status !== 200) problems.push(`${r.status} ${u}`); }));
for (const u of audio) {
  const r = await get(u, { range: true });
  if (![200, 206].includes(r.status) || !/audio|octet-stream/.test(r.type)) problems.push(`audio ${r.status} ${r.type} ${u}`);
  await new Promise((r2) => setTimeout(r2, 800));
}
console.log(`checked ${pages.length} pages, ${list.length} files and ${audio.size} audio files`);
if (problems.length) { console.error("broken:\n" + problems.map((p) => " - " + p).join("\n")); process.exit(1); }
console.log("all good");
