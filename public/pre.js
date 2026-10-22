// Runs before anything else (index.html loads it synchronously in <head>). A file, not inline,
// so the production Content-Security-Policy can forbid inline scripts.
// iPhone keeps the page's own address (with the list's #k=) when the manifest has no
// start_url; Android needs one to install. Docs: docs/research/2026-10-21-pwa.md §3.
(function () {
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var l = document.createElement('link');
  l.rel = 'manifest';
  l.href = ios ? './manifest-ios.webmanifest' : './manifest.webmanifest';
  document.head.appendChild(l);
  // paint the paper colour before any script or font arrives
  try {
    var p = JSON.parse(localStorage.getItem('ll.prefs') || '{}');
    var dark = p.theme === 'pizarron' || (p.theme !== 'papel' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'pizarron' : 'papel';
  } catch (e) {}
})();
