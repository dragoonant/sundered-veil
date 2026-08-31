// End-of-match video: art/victory.mp4 on a win, art/defeat.mp4 on a loss.
// The clip carries its own audio, so it CLAIMS the finale from js/sound.js —
// the music fades and the synthesized swell is skipped. If the file is missing
// or the browser will not play it, the claim is released and sound.js falls
// back to its swell exactly as before.
(function (SB) {
  'use strict';

  const SRC = { win: 'art/victory.mp4', loss: 'art/defeat.mp4' };
  let shown = false;   // one clip per match
  let node = null;     // the overlay while it is on screen

  function dismiss() {
    if (!node) return;
    const n = node;
    node = null;
    n.classList.remove('open');
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 400);
  }

  // Give the finale back to the music layer and take the overlay down.
  function fail(win) {
    dismiss();
    if (SB.sound && SB.sound.playEndingFallback) SB.sound.playEndingFallback(win);
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
    skip.addEventListener('click', function (e) { e.stopPropagation(); dismiss(); });
    video.addEventListener('ended', dismiss);
    video.addEventListener('error', function () { fail(win); });
    overlay.addEventListener('click', dismiss);
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
      play(win);
      return true;
    },
    // New game / undo past the end: allow the next match its own clip.
    reset: function () { shown = false; dismiss(); },
  };
})(window.SB = window.SB || {});
