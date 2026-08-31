// sound.js — SFX from structured log entries + the adaptive battle score.
// Music runs on Web Audio for GAPLESS looping: decoded buffers get their leading/
// trailing silence trimmed and loop inside those points, so a generated track that
// ends in quiet never "stops then restarts".
//
// Three intensity tiers keyed to the lowest remaining base HP:
//   > 20  tier 1 (stately)   |  > 10  tier 2 (urgent)  |  <= 10  tier 3 (frenzied)
// Preferred sources are sfx/music-1/2/3.mp3 (one shared motif, see
// tools/gen-music.mjs). Until those exist, the single sfx/music.mp3 drives all
// three tiers at rising playback rates — the same recording, growing frenzied.
// At 0 HP the score resolves: sfx/end-win.mp3 / end-loss.mp3 if present, else a
// synthesized D-major (victory) or D-minor (defeat) swell.
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

  // ======================= adaptive music =======================
  const Music = {
    ctx: null, buffers: {}, tierRates: [1, 1, 1], sharedFallback: false,
    current: null,        // {tier, source, gain}
    tier: 0, ended: false, started: false,
  };
  const FADE_S = 1.6;

  function actx() {
    if (!Music.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      Music.ctx = new AC();
    }
    if (Music.ctx.state === 'suspended') Music.ctx.resume();
    return Music.ctx;
  }

  function fetchBuffer(name) {
    const ctx = actx();
    if (!ctx) return Promise.resolve(null);
    return fetch('sfx/' + name + '.mp3')
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then(function (ab) { return ctx.decodeAudioData(ab); })
      .catch(function () { return null; });
  }

  // Find the audible span so the loop skips decoder padding and trailing silence.
  function audibleSpan(buf) {
    const d = buf.getChannelData(0);
    const thr = 0.004;
    let a = 0, b = d.length - 1;
    while (a < d.length && Math.abs(d[a]) < thr) a++;
    while (b > a && Math.abs(d[b]) < thr) b--;
    return { start: a / buf.sampleRate, end: (b + 1) / buf.sampleRate };
  }

  function loadMusic() {
    if (Music.loading) return Music.loading;
    Music.loading = Promise.all([
      fetchBuffer('music-1'), fetchBuffer('music-2'), fetchBuffer('music-3'),
      fetchBuffer('end-win'), fetchBuffer('end-loss'), fetchBuffer('music'),
    ]).then(function (r) {
      if (r[0] && r[1] && r[2]) {
        Music.buffers = { 1: r[0], 2: r[1], 3: r[2] };
      } else if (r[5]) {
        // Single-track fallback: one recording, rising playback rate per tier.
        Music.buffers = { 1: r[5], 2: r[5], 3: r[5] };
        Music.tierRates = [1.0, 1.09, 1.18];
        Music.sharedFallback = true;
      }
      Music.endBuffers = { win: r[3], loss: r[4] };
    });
    return Music.loading;
  }

  function playTier(tier) {
    const ctx = actx();
    const buf = Music.buffers[tier];
    if (!ctx || !buf) return;
    const span = audibleSpan(buf);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = span.start;
    src.loopEnd = span.end;
    src.playbackRate.value = Music.tierRates[tier - 1] || 1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + FADE_S);
    src.connect(gain).connect(ctx.destination);
    // When both tiers share one buffer, keep musical position across the switch.
    let offset = span.start;
    if (Music.sharedFallback && Music.current && Music.current.startedAt != null) {
      const played = (ctx.currentTime - Music.current.startedAt) * (Music.current.rate || 1);
      const len = span.end - span.start;
      offset = span.start + (played % len);
    }
    src.start(0, offset);
    fadeOutCurrent();
    Music.current = { tier: tier, source: src, gain: gain, startedAt: ctx.currentTime, rate: src.playbackRate.value };
    Music.tier = tier;
  }

  function fadeOutCurrent(fast) {
    if (!Music.current) return;
    const ctx = Music.ctx;
    const old = Music.current;
    const t = fast ? 0.6 : FADE_S;
    try {
      old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
      old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + t);
      old.source.stop(ctx.currentTime + t + 0.05);
    } catch (e) {}
    Music.current = null;
  }

  function tierFor(state) {
    let low = Infinity;
    state.players.forEach(function (p) {
      const hp = SB.card(p.base.cardId).hp - p.base.damage;
      if (hp < low) low = hp;
    });
    if (low > 20) return 1;
    if (low > 10) return 2;
    return 3;
  }

  // Synthesized finale fallback: a short orchestral-ish chord swell in D.
  function synthEnding(win) {
    const ctx = actx();
    if (!ctx) return;
    const freqs = win ? [146.83, 220.0, 293.66, 369.99]   // D3 A3 D4 F#4 — D major
                      : [146.83, 220.0, 293.66, 349.23];  // D3 A3 D4 F4  — D minor
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + (win ? 0.6 : 1.2));
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (win ? 4.5 : 6));
    master.connect(ctx.destination);
    freqs.forEach(function (f, i) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = win ? f : f * 0.999;            // hair of gravity on the loss
      const g = ctx.createGain();
      g.gain.value = 0.22 / freqs.length * (i === 0 ? 1.6 : 1);
      o.connect(g).connect(master);
      o.start(ctx.currentTime + i * (win ? 0.05 : 0.15)); // win stabs in, loss sags in
      o.stop(ctx.currentTime + 6.5);
    });
  }

  function playEnding(win) {
    if (Music.ended) return;
    Music.ended = true;
    fadeOutCurrent(true);
    // The end-of-match video brings its own audio; let it own the finale.
    if (SB.endVideo && SB.endVideo.claim(win)) return;
    const buf = Music.endBuffers && Music.endBuffers[win ? 'win' : 'loss'];
    const ctx = actx();
    if (buf && ctx) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      src.connect(g).connect(ctx.destination);
      src.start(ctx.currentTime + 0.4);
    } else {
      setTimeout(function () { synthEnding(win); }, 400);
    }
  }

  function updateMusic(state) {
    if (!state || !Music.started || muted) return;
    if (SB.isTerminal(state)) {
      playEnding(state.winner === (SB.ui ? SB.ui.humanSeat : 0));
      return;
    }
    if (Music.ended) return;
    const t = tierFor(state);
    if (t !== Music.tier) playTier(t);
  }

  // ======================= public surface =======================
  SB.sound = {
    isMuted: function () { return muted; },
    // Handed back by js/endvideo.js when the clip cannot play.
    playEndingFallback: function (win) {
      if (muted) return;
      const buf = Music.endBuffers && Music.endBuffers[win ? "win" : "loss"];
      const ctx = actx();
      if (buf && ctx) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = 0.35;
        src.connect(g).connect(ctx.destination);
        src.start(ctx.currentTime + 0.4);
      } else {
        setTimeout(function () { synthEnding(win); }, 400);
      }
    },
    toggleMute: function () {
      muted = !muted;
      if (muted) fadeOutCurrent(true);
      return muted;
    },
    // Called by the UI after every apply: SFX for new log entries + music tier.
    play: function (state) {
      const fresh = state.log.slice(lastLogLen);
      lastLogLen = state.log.length;
      if (!muted) {
        const seen = {};
        fresh.forEach(function (l) {
          if (!l.sound || seen[l.sound]) return; // one clip per type per action
          seen[l.sound] = true;
          try {
            const a = clip(l.sound).cloneNode();
            a.volume = 0.5;
            a.play().catch(function () { /* pre-interaction / missing file */ });
          } catch (e) { /* no audio support */ }
        });
      }
      updateMusic(state);
    },
    reset: function () {
      lastLogLen = 0;
      Music.ended = false;
      if (SB.endVideo) SB.endVideo.reset();
      fadeOutCurrent(true);
      Music.tier = 0;
      if (Music.started && SB.ui && SB.ui.state) updateMusic(SB.ui.state);
    },
    // Kicked off on new game; real playback begins after the first user gesture
    // (browsers gate audio) — the first doAction's updateMusic picks it up.
    // Debug/inspection hook (used by tests and the pane; safe to keep).
    _debug: function () {
      return { started: Music.started, tier: Music.tier, ended: Music.ended,
        sharedFallback: Music.sharedFallback,
        buffers: Object.keys(Music.buffers).length,
        endings: Music.endBuffers ? [!!Music.endBuffers.win, !!Music.endBuffers.loss] : null,
        rate: Music.current ? Music.current.rate : 0,
        ctxState: Music.ctx ? Music.ctx.state : 'none' };
    },
    startAmbience: function () {
      Music.started = true;
      loadMusic().then(function () {
        if (!muted && !Music.ended && SB.ui && SB.ui.state && !SB.isTerminal(SB.ui.state)) {
          playTier(tierFor(SB.ui.state));
        }
      });
    },
  };
})(window.SB = window.SB || {});
