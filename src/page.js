// Every page: the player where there is one, and optional cookieless counting when the site has that key.
const gc = document.body.dataset.gc;
try {
  if (gc && navigator.doNotTrack !== "1" && !navigator.globalPrivacyControl) {
    const img = new Image();
    img.src = `${gc}?p=${encodeURIComponent(location.pathname)}&rnd=${Math.random().toString(36).slice(2)}`;
  }
} catch { /* counting is optional */ }
if (document.getElementById("player")) import("./player.js");
