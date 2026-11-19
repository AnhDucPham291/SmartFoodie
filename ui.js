// Shared page helpers: escaping, icons, photos, toast messages, dialogs, device storage,
// review times, QR codes, and copy/share. Loaded before app.js and orders.js.
(function (root) {
  const SF = root.SF || (root.SF = {});
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const usd = dollars => `$${Number(dollars).toFixed(2)}`;
  const cents = SF.formatMoney;

  // Per-device conveniences; the site works without storage (private windows, blocked storage).
  const store = {
    get(key, fallback) {
      try { const value = localStorage.getItem(`sf:${key}`); return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`sf:${key}`, JSON.stringify(value)); return true; } catch { return false; }
    }
  };

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------- Photos ----------
  const PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#ebebea"/><text x="2" y="1.85" font-size="1" text-anchor="middle">🍽️</text></svg>')}`;
  function img(image, alt, { sizes = '(max-width: 760px) 50vw, 300px', widths = [400, 800], width = 600, eager = false } = {}) {
    const srcset = SF.imageSrcset(image, widths);
    return `<img src="${esc(SF.imageUrl(image, width))}"${srcset ? ` srcset="${esc(srcset)}" sizes="${sizes}"` : ''} alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
  }
  // Swap any photo that fails to load for a neutral placeholder instead of a broken icon.
  document.addEventListener('error', event => {
    const target = event.target;
    if (target instanceof HTMLImageElement && !target.dataset.failed && !target.closest('.qr-code, .leaflet-container')) {
      target.dataset.failed = '1';
      target.removeAttribute('srcset');
      target.src = PLACEHOLDER;
    }
  }, true);

  // ---------- Dialogs ----------
  const openDialog = dialog => { if (!dialog.open) dialog.showModal(); };
  // Close on [data-close] buttons and on clicks outside the dialog box.
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-close]')) { dialog.close(); return; }
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
  });

  // ---------- Text ----------
  const stars = rating => `<span class="stars" role="img" aria-label="${rating} out of 5 stars">${[1, 2, 3, 4, 5].map(n => icon('star', `icon${n <= Math.round(rating) ? '' : ' off'}`)).join('')}</span>`;
  function timeAgo(minutes) {
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${Math.round(minutes)} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 2) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return '1 week ago';
    return `${Math.floor(days / 7)} weeks ago`;
  }
  const initials = name => String(name).split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const shortName = name => { const [first, last = ''] = String(name).split(' '); return last ? `${first} ${last[0]}.` : first; };
  const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

  // ---------- QR codes, copy, share ----------
  function makeQr(container, text, size = 196) {
    container.replaceChildren();
    if (!window.QRCode) {
      container.innerHTML = '<p class="muted">The QR code could not load. Use Copy link instead.</p>';
      return false;
    }
    try {
      new window.QRCode(container, { text, width: size, height: size, colorDark: '#141414', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      container.setAttribute('role', 'img');
      return true;
    } catch {
      container.innerHTML = '<p class="muted">This link is too long for a QR code. Use Copy link instead.</p>';
      return false;
    }
  }
  async function copyText(text, message = 'Copied') {
    try { await navigator.clipboard.writeText(text); toast(message); } catch { window.prompt('Copy this:', text); }
  }
  // Uses the phone's share sheet when there is one, otherwise copies the text.
  async function shareText({ title, text, url }) {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch (error) { if (error && error.name === 'AbortError') return; }
    }
    await copyText(url ? `${text}\n${url}` : text, url ? 'Link copied' : 'Copied');
  }

  SF.ui = { $, $$, esc, icon, usd, cents, store, toast, img, PLACEHOLDER, openDialog, stars, timeAgo, initials, shortName, plural, makeQr, copyText, shareText };
})(window);
