// The read-along player: highlights each word as the narrator reads it, follows the voice, seeks on tap, shows the
// latest illustration beside the text on wide screens, and remembers your place (in this browser only).
// The audio plays from the Internet Archive; nothing is sent anywhere else.

export function wordAt(times, cs) {
  // last word whose start time is at or before cs (binary search); -1 before the first word
  let lo = 0, hi = times.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= cs) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function sentenceIds(words) {
  const ids = new Array(words.length);
  let id = 0;
  for (let i = 0; i < words.length; i++) {
    ids[i] = id;
    if (/[.!?]["'”’)\]]*$/.test(words[i]) && !/^(Mr|Mrs|Dr|St|Mt|Jr|Sr|vs|i\.e|e\.g)\.$/i.test(words[i])) id++;
  }
  return ids;
}

export const fmt = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

function boot() {
  const player = document.getElementById("player");
  const audio = document.getElementById("audio");
  const timesEl = document.getElementById("times");
  if (!player || !audio || !timesEl) return;
  const times = JSON.parse(timesEl.textContent);
  const spans = [...document.querySelectorAll("#text .w")];
  if (spans.length !== times.length) console.warn(`word count ${spans.length} differs from timings ${times.length}`);
  const sent = sentenceIds(spans.map((s) => s.textContent));
  const $ = (id) => document.getElementById(id);
  const controls = player.querySelector(".controls");
  const store = { key: `ra:${player.dataset.book}:${player.dataset.n}` };
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* not saved */ } };
  // Custom controls replace the browser's once the script runs.
  controls.hidden = false;
  $("progress").hidden = false;
  audio.controls = false;
  let current = -1, currentSent = -1, follow = true, pausedFollowUntil = 0, lastSeek = null;
  const figures = [...document.querySelectorAll("#text figure.ill")].map((fig) => {
    // an illustration belongs to the first word after it
    let el = fig.nextElementSibling;
    while (el && !el.querySelector?.(".w")) el = el.nextElementSibling;
    const firstWord = el ? el.querySelector(".w") : null;
    return { fig, at: firstWord ? times[spans.indexOf(firstWord)] : Infinity };
  });
  const picture = $("picture");
  let shownFig = null;

  function highlight(i) {
    if (i === current) return;
    if (current >= 0 && spans[current]) spans[current].classList.remove("on");
    if (i >= 0 && spans[i]) spans[i].classList.add("on");
    const s = i >= 0 ? sent[i] : -1;
    if (s !== currentSent) {
      for (let k = 0; k < spans.length; k++) if (sent[k] === currentSent) spans[k].classList.remove("s");
      if (s >= 0) for (let k = Math.max(0, i - 80); k < Math.min(spans.length, i + 80); k++) if (sent[k] === s) spans[k].classList.add("s");
      currentSent = s;
    }
    current = i;
    if (i >= 0 && follow && Date.now() > pausedFollowUntil) {
      const r = spans[i].getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.top < vh * 0.25 || r.bottom > vh * 0.75) { programmaticScroll = Date.now(); spans[i].scrollIntoView({ block: "center", behavior: "smooth" }); }
    }
  }

  function showPicture(cs) {
    if (!picture) return;
    let best = null;
    for (const f of figures) if (f.at <= cs) best = f;
    if (best === shownFig) return;
    shownFig = best;
    picture.replaceChildren();
    if (best && window.matchMedia("(min-width: 1100px)").matches) {
      picture.append(best.fig.querySelector("img").cloneNode(true));
      const cap = best.fig.querySelector("figcaption");
      if (cap) picture.append(cap.cloneNode(true));
      picture.hidden = false;
    } else picture.hidden = true;
  }

  function tick(t = audio.currentTime) {
    const cs = Math.round(t * 100);
    highlight(wordAt(times, cs));
    showPicture(cs);
    const d = audio.duration || 0;
    $("clock").textContent = `${fmt(t)} / ${fmt(d || Number(player.dataset.duration) || 0)}`;
    if (d) $("bar").style.width = `${(100 * t / d).toFixed(2)}%`;
  }

  function seek(t, play = true) {
    lastSeek = t;
    audio.currentTime = t;
    tick(t);
    if (play) audio.play().catch(() => {});
  }

  let raf = 0;
  const loop = () => { tick(); raf = requestAnimationFrame(loop); };
  audio.addEventListener("play", () => { $("play").textContent = "❚❚"; $("play").setAttribute("aria-label", "Pause"); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); });
  audio.addEventListener("pause", () => { $("play").textContent = "▶"; $("play").setAttribute("aria-label", "Play"); cancelAnimationFrame(raf); tick(); set(store.key, String(audio.currentTime)); });
  audio.addEventListener("timeupdate", () => { if (!audio.paused && Math.floor(audio.currentTime) % 5 === 0) set(store.key, String(audio.currentTime)); });
  audio.addEventListener("ended", () => {
    set(store.key, "0");
    const next = player.dataset.next;
    if (next) { const r = $("resume"); r.hidden = false; r.replaceChildren(Object.assign(document.createElement("a"), { href: next, className: "btn", textContent: "Next chapter →" })); }
  });
  $("play").addEventListener("click", () => (audio.paused ? audio.play().catch(() => {}) : audio.pause()));
  $("back").addEventListener("click", () => seek(Math.max(0, audio.currentTime - 10), !audio.paused));
  $("fwd").addEventListener("click", () => seek(audio.currentTime + 10, !audio.paused));
  $("speed").addEventListener("change", (e) => { audio.playbackRate = Number(e.target.value); set("ra:speed", e.target.value); });
  const savedSpeed = get("ra:speed");
  if (savedSpeed) { $("speed").value = savedSpeed; audio.playbackRate = Number(savedSpeed); }
  $("follow").addEventListener("change", (e) => { follow = e.target.checked; });
  $("progress").addEventListener("click", (e) => { const r = e.currentTarget.getBoundingClientRect(); if (audio.duration) seek(audio.duration * (e.clientX - r.left) / r.width, !audio.paused); });
  document.getElementById("text").addEventListener("click", (e) => {
    const w = e.target.closest(".w");
    if (!w) return;
    const i = spans.indexOf(w);
    if (i >= 0) seek(times[i] / 100);
  });
  const size = (d) => { const v = Math.min(1.6, Math.max(0.85, (Number(get("ra:size")) || 1) + d)); document.documentElement.style.setProperty("--text-scale", v); set("ra:size", String(v)); };
  if ($("smaller")) { $("smaller").addEventListener("click", () => size(-0.1)); $("bigger").addEventListener("click", () => size(0.1)); size(0); }
  // Scrolling by hand pauses following for a while; a button brings you back to the voice.
  let programmaticScroll = 0;
  const userScroll = () => {
    if (Date.now() - programmaticScroll < 900 || audio.paused) return;
    pausedFollowUntil = Date.now() + 8000;
    $("tovoice").hidden = false;
    clearTimeout(userScroll.t);
    userScroll.t = setTimeout(() => { $("tovoice").hidden = true; }, 8000);
  };
  window.addEventListener("wheel", userScroll, { passive: true });
  window.addEventListener("touchmove", userScroll, { passive: true });
  $("tovoice").addEventListener("click", () => { pausedFollowUntil = 0; $("tovoice").hidden = true; current = -2; tick(); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea, button")) return;
    if (e.key === " ") { e.preventDefault(); audio.paused ? audio.play().catch(() => {}) : audio.pause(); }
    else if (e.key === "ArrowLeft") seek(Math.max(0, audio.currentTime - 5), !audio.paused);
    else if (e.key === "ArrowRight") seek(audio.currentTime + 5, !audio.paused);
  });
  // Resume where you left off.
  const saved = Number(get(store.key));
  if (saved > 5) {
    const r = $("resume");
    r.hidden = false;
    const b = Object.assign(document.createElement("button"), { type: "button", className: "btn ghost small", textContent: `Resume at ${fmt(saved)}` });
    b.addEventListener("click", () => { r.hidden = true; seek(saved); });
    r.append("You were part-way through. ", b);
  }
  if ("mediaSession" in navigator) {
    const h1 = document.querySelector("h1")?.textContent || document.title;
    navigator.mediaSession.metadata = new MediaMetadata({ title: h1, artist: document.querySelector(".eyebrow, .embed-title")?.textContent || "", album: "Read-Along Classics" });
  }
  // Hooks for the self-test: drive the clock without playing audio, and read what a tap would seek to.
  window.__readalong = { tick, words: spans.length, times: times.length, current: () => current, lastSeek: () => lastSeek, wordAt: (t) => wordAt(times, Math.round(t * 100)) };
  tick(0);
}

if (typeof document !== "undefined") boot();
