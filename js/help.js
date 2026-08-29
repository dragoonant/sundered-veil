// help.js — the How to Play modal. All text comes from SB.names.help (display-text
// rule). UI-only file: loaded by index.html, not tests.html.
(function (SB) {
  'use strict';

  SB.help = {
    open: function () {
      if (document.getElementById('help-overlay')) return;
      const H = SB.names.help;
      const overlay = document.createElement('div');
      overlay.id = 'help-overlay';
      const box = document.createElement('div');
      box.id = 'help-box';

      const head = document.createElement('div');
      head.id = 'help-head';
      const title = document.createElement('h2');
      title.textContent = H.title;
      const close = document.createElement('button');
      close.textContent = H.close;
      close.className = 'action-btn';
      close.onclick = SB.help.close;
      head.appendChild(title);
      head.appendChild(close);
      box.appendChild(head);

      const body = document.createElement('div');
      body.id = 'help-body';
      H.sections.forEach(function (sec) {
        const h = document.createElement('h3');
        h.textContent = sec[0];
        const p = document.createElement('p');
        p.textContent = sec[1];
        body.appendChild(h);
        body.appendChild(p);
      });
      box.appendChild(body);
      overlay.appendChild(box);
      // Clicking the dimmed backdrop (not the box) closes the modal.
      overlay.onclick = function (e) { if (e.target === overlay) SB.help.close(); };
      document.body.appendChild(overlay);
      document.addEventListener('keydown', escClose);
    },
    close: function () {
      const o = document.getElementById('help-overlay');
      if (o) o.remove();
      document.removeEventListener('keydown', escClose);
    },
  };

  function escClose(e) { if (e.key === 'Escape') SB.help.close(); }
})(window.SB = window.SB || {});
