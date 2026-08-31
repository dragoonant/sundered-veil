// sound.js — SFX from structured log entries + the adaptive battle score.
// Music runs on Web Audio for GAPLESS looping: decoded buffers are trimmed to their
// SUSTAINED body — an RMS envelope finds where the recorded fade-in has come up and
// where the closing decrescendo starts, and the loop lives strictly inside those
// points. Trimming silence alone was not enough: a generated track's fade-out is loud
// enough to pass a silence test, so the loop sounded like the piece ending and
// starting again. Playback also begins at full level — only tier switches crossfade.
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
  const FADE_S = 1.6;          // crossfade length when the tier changes mid-match
  const OUT_S = 0.9;           // how fast the outgoing tier gets out of the way
  // Tier 1 opens the match: quieter and softened, so it reads as tension rather than
  // a duel already in progress. The later tiers open up in level and brightness.
  const TIER_GAIN = [0.13, 0.20, 0.27];
  const TIER_TONE = [1500, 4500, 14000];   // lowpass cutoff, Hz

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

  // Loop span = the sustained body of the track. A coarse RMS envelope is measured and
  // the loop runs from the first to the last window holding a good fraction of the
  // track's typical level, which drops decoder padding, the recorded fade-in, and the
  // closing decrescendo that made looping sound like a restart.
  const spanCache = new WeakMap();
  function audibleSpan(buf) {
    const cached = spanCache.get(buf);
    if (cached) return cached;
    const d = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const win = Math.max(1, Math.round(sr * 0.05));        // 50 ms windows
    const env = [];
    for (let i = 0; i + win <= d.length; i += win) {
      let sum = 0;
      for (let j = i; j < i + win; j++) sum += d[j] * d[j];
      env.push(Math.sqrt(sum / win));
    }
    let span = { start: 0, end: buf.duration };
    if (env.length) {
      // Typical level = median of the windows that are not near-silent.
      const loud = env.filter(function (v) { return v > 0.004; })
                      .sort(function (x, y) { return x - y; });
      const median = loud.length ? loud[Math.floor(loud.length / 2)] : 0;
      const thr = Math.max(0.004, median * 0.8);
      let lo = 0, hi = env.length - 1;
      while (lo < env.length && env[lo] < thr) lo++;
      while (hi > lo && env[hi] < thr) hi--;
      if (lo < env.length) {
        // Nudge inward one window so neither loop edge sits on a ramp.
        const start = Math.min(lo + 1, hi) * win / sr;
        const end = Math.min(d.length, (hi + 1) * win) / sr;
        if (end - start > 1) span = { start: start, end: end };
      }
    }
    spanCache.set(buf, span);
    return span;
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
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = TIER_TONE[tier - 1] || 14000;
    const gain = ctx.createGain();
    const level = TIER_GAIN[tier - 1] || 0.22;
    // Straight in at level: the score is meant to be already playing, not to swell up.
    gain.gain.setValueAtTime(level, ctx.currentTime);
    src.connect(tone).connect(gain).connect(ctx.destination);
    // When both tiers share one buffer, keep musical position across the switch.
    let offset = span.start;
    if (Music.sharedFallback && Music.current && Music.current.startedAt != null) {
      const played = (ctx.currentTime - Music.current.startedAt) * (Music.current.rate || 1);
      const len = span.end - span.start;
      offset = span.start + (played % len);
    }
    src.start(0, offset);
    fadeOutCurrent(true);   // incoming line is instant; the old one ducks out under it
    Music.current = { tier: tier, source: src, gain: gain, startedAt: ctx.currentTime, rate: src.playbackRate.value };
    Music.tier = tier;
  }

  function fadeOutCurrent(fast) {
    if (!Music.current) return;
    const ctx = Music.ctx;
    const old = Music.current;
    const t = fast ? OUT_S : FADE_S;
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
      // The old state is still the finished match at this point: replaying its
      // ending here would re-trigger the end-of-match video over the new game.
      if (Music.started && SB.ui && SB.ui.state && !SB.isTerminal(SB.ui.state)) updateMusic(SB.ui.state);
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
