// End-of-match video: art/victory.mp4 on a win, art/defeat.mp4 on a loss.
// The clip carries its own audio, so it CLAIMS the finale from js/sound.js while
// it is on screen — the music fades and nothing plays under it. The moment the
// clip ends (or is skipped, or fails to play at all) the finale is handed back to
// sound.js, so the victory/defeat music always gets heard, just after the video
// instead of buried beneath it.
(function (SB) {
  'use strict';

  const SRC = { win: 'art/victory.mp4', loss: 'art/defeat.mp4' };
  let shown = false;   // one clip per match
  let node = null;     // the overlay while it is on screen
  let pending = null;  // the win/loss the finale music still owes, once per match

  // immediate: pull the overlay out now instead of letting it fade. A new match is
  // already drawing behind it, so the old clip must not linger over the fresh board.
  function dismiss(immediate) {
    if (!node) return;
    const n = node;
    node = null;
    n.classList.remove('open');
    if (immediate) { if (n.parentNode) n.parentNode.removeChild(n); return; }
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 400);
  }

  // Hand the finale back to the music layer: the clip is done (ended, skipped or
  // never played), so the victory/defeat music plays now. Once per match.
  function releaseFinale() {
    if (pending == null) return;
    const win = pending;
    pending = null;
    if (SB.sound && SB.sound.playEndingFallback) SB.sound.playEndingFallback(win);
  }

  // Take the overlay down and let the music finish the match.
  function finish() {
    dismiss();
    releaseFinale();
  }

  function play(win) {
    const overlay = document.createElement('div');
    overlay.id = 'end-video';
    const video = document.createElement('video');
    video.src = SRC[win ? 'win' : 'loss'];
    video.autoplay = true;
    video.playsInline = true;
    video.muted = !!(SB.sound && SB.sound.isMuted && SB.sound.isMuted());
    const skip = document.createElement('button');
    skip.className = 'end-video-skip';
    skip.textContent = SB.names.ui.skip || 'Skip';
    skip.addEventListener('click', function (e) { e.stopPropagation(); finish(); });
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    overlay.addEventListener('click', finish);
    overlay.appendChild(video);
    overlay.appendChild(skip);
    document.body.appendChild(overlay);
    node = overlay;
    requestAnimationFrame(function () { overlay.classList.add('open'); });
    // Autoplay can still be blocked (no user gesture yet); that is not a
    // missing file, so keep the overlay and let the click-to-dismiss stand.
    const p = video.play();
    if (p && p.catch) p.catch(function () {});
  }

  SB.endVideo = {
    // Called by js/sound.js at the moment the match ends. Returns true when the
    // video takes over the finale.
    claim: function (win) {
      if (shown) return true;
      shown = true;
      pending = !!win;
      play(win);
      return true;
    },
    // New game / undo past the end: allow the next match its own clip.
    // New game / undo past the end: no finale is owed to the fresh match.
    reset: function () { shown = false; pending = null; dismiss(true); },
  };
})(window.SB = window.SB || {});
