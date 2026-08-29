// sound.js — plays SFX from structured log entries (never from prose). Loaded in
// index.html only. Missing files fail silently so the game works without audio.
(function (SB) {
  'use strict';

  const cache = {};
  let lastLogLen = 0;
  let muted = false;

  function clip(name) {
    if (!cache[name]) {
      const a = new Audio('sfx/' + name + '.mp3');
      a.preload = 'auto';
      cache[name] = a;
    }
    return cache[name];
  }

  SB.sound = {
    toggleMute: function () { muted = !muted; return muted; },
    // Called by the UI after every apply: plays sounds for NEW log entries only.
    play: function (state) {
      const fresh = state.log.slice(lastLogLen);
      lastLogLen = state.log.length;
      if (muted) return;
      const seen = {};
      fresh.forEach(function (l) {
        if (!l.sound || seen[l.sound]) return; // one clip per type per action
        seen[l.sound] = true;
        try {
          const a = clip(l.sound).cloneNode();
          a.volume = 0.5;
          a.play().catch(function () { /* not yet interacted / missing file */ });
        } catch (e) { /* no audio support */ }
      });
    },
    reset: function () { lastLogLen = 0; },
    startAmbience: function () {
      // Prefer the orchestral battle track when it exists; the quiet engine-hum
      // ambience is the fallback. Both loop; missing files fail silently.
      try {
        const music = clip('music');
        music.loop = true;
        music.volume = 0.25;
        const p = music.play();
        if (p && p.catch) {
          p.catch(function () { fallbackAmbience(); });
        }
        music.onerror = fallbackAmbience;
      } catch (e) { fallbackAmbience(); }
      function fallbackAmbience() {
        try {
          const a = clip('ambience');
          a.loop = true;
          a.volume = 0.15;
          a.play().catch(function () {});
        } catch (e2) {}
      }
    },
  };
})(window.SB = window.SB || {});
