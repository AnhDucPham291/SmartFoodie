// "Get the app": SmartFoodie works in any browser, and anyone who prefers an app can add it to
// their Home Screen, where it opens full screen with its own icon. The app is this same website,
// so both always show the latest version. iPhone and iPad have no install prompt, so we show the
// steps; Android and desktop Chrome or Edge use the browser's own Install prompt; on a computer,
// a QR code opens the site on a phone.
(() => {
  const SF = window.SF;
  const { $, $$, icon, toast, openDialog, makeQr, copyText } = SF.ui;
  const dialog = $('#appDialog');
  const stepsBox = $('#appSteps');
  const buttons = $$('[data-get-app]');

  const ua = navigator.userAgent;
  // iPadOS Safari reports itself as a Mac, so touch support tells the two apart.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  // Browsers built into apps such as Zalo, Messenger, or Instagram can't add pages to the Home Screen.
  const inAppBrowser = (isIOS && !/Safari\//.test(ua)) || (isAndroid && /; wv\)/.test(ua));
  const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Version\/[\d.]+.* Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
  const standalone = window.matchMedia('(display-mode: standalone)');
  const runningAsApp = () => standalone.matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const siteUrl = () => new URL('./', location.href).href;

  // Inside the installed app there is nothing to get, so the buttons hide.
  const syncButtons = () => buttons.forEach(button => { button.hidden = runningAsApp(); });
  syncButtons();
  standalone.addEventListener?.('change', syncButtons);

  // Chrome and Edge have their own Install prompt. Keep it for when someone taps Get the app,
  // instead of letting the browser pop it up on its own.
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (dialog.open) dialog.close();
    toast('SmartFoodie is installed. Open it like any other app.');
  });
  // Must be called straight from a tap. Returns false if the browser wouldn't show the prompt.
  async function showInstallPrompt() {
    const prompt = installPrompt;
    installPrompt = null; // each prompt can be shown only once
    try {
      await prompt.prompt();
      await prompt.userChoice;
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Steps for this device ----------
  const stepList = items => `<ol class="app-steps">${items.map(item => `<li>${item}</li>`).join('')}</ol>`;
  const note = html => `<p class="app-note">${html}</p>`;
  const copyButton = `<button type="button" class="button button-secondary" data-copy-app-link>${icon('copy')} Copy link</button>`;
  const SAFARI_SHARE = "In Safari, it's in the toolbar or under the <b>•••</b> button.";
  function shareHint() {
    if (/CriOS/.test(ua)) return "In Chrome, it's at the right end of the address bar.";
    if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua)) return "It's in your browser's toolbar or menu.";
    return SAFARI_SHARE;
  }
  const iosSteps = hint => [
    `Tap <b>Share</b> ${icon('share')}. ${hint}`,
    `Scroll down and tap <b>Add to Home Screen</b> ${icon('add-square')}.`,
    'Tap <b>Add</b>. If you see <b>Open as Web App</b>, leave it on.'
  ];
  const androidSteps = () => [
    'Tap the menu button <b>⋮</b> in your browser.',
    'Tap <b>Install app</b> or <b>Add to Home screen</b>.',
    'Choose <b>Install</b> to confirm.'
  ];
  const openInBrowser = name => `Open this page in <b>${name}</b>: tap the <b>•••</b> menu, then <b>Open in ${name}</b> or <b>Open in browser</b>. The browser built into this app can't add pages to your Home Screen.`;

  function localHint() {
    if (location.protocol === 'file:') return "This page was opened from a file, so phones can't open this code. Publish the site first.";
    if (['localhost', '127.0.0.1'].includes(location.hostname)) return 'This code uses localhost, which only works on this computer. Open the Wi-Fi address printed by serve.py to try it on a phone.';
    if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname)) return 'This code works only on the same Wi-Fi while serve.py is running. Install the app from the public link so it keeps working.';
    return '';
  }

  function render() {
    let html;
    if (isIOS || isAndroid) {
      const browser = isIOS ? 'Safari' : 'Chrome';
      const items = isIOS ? iosSteps(inAppBrowser ? SAFARI_SHARE : shareHint()) : androidSteps();
      if (inAppBrowser) items.unshift(openInBrowser(browser));
      html = stepList(items);
      if (inAppBrowser) html += copyButton;
      if (isIOS) html += note('The app keeps its own orders and reservations, separate from your browser.');
    } else {
      // On a computer, the app people want is usually on their phone.
      html = `<div class="app-qr"><div class="qr-code qr-small" id="appQr"></div><p>Scan this code with your phone's camera to open SmartFoodie, then tap <b>Get the app</b> there.</p></div>
        <div class="share-actions">${installPrompt ? '<button type="button" class="button button-primary" data-install-here>Install on this computer</button>' : ''}${copyButton}</div>`;
      if (isMacSafari) html += note('On this Mac, you can also choose <b>File</b> → <b>Add to Dock</b> in Safari.');
      const hint = localHint();
      if (hint) html += note(hint);
    }
    stepsBox.innerHTML = html;
    const qr = $('#appQr', stepsBox);
    if (qr) makeQr(qr, siteUrl(), 132);
  }

  async function getApp() {
    // Android opens Chrome's own Install prompt; everything else gets the steps for this device.
    if (isAndroid && !inAppBrowser && installPrompt && await showInstallPrompt()) return;
    render();
    openDialog(dialog);
  }

  buttons.forEach(button => button.addEventListener('click', getApp));
  stepsBox.addEventListener('click', event => {
    if (event.target.closest('[data-copy-app-link]')) copyText(siteUrl(), 'Link copied. Paste it into your browser.');
    else if (event.target.closest('[data-install-here]')) { dialog.close(); showInstallPrompt(); }
  });
})();
