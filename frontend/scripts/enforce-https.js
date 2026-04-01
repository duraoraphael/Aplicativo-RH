(function enforceHttps() {
  try {
    if (typeof window === 'undefined' || !window.location) {
      return;
    }

    var host = String(window.location.hostname || '').toLowerCase();
    var isLocalHost = host === 'localhost' || host === '127.0.0.1';

    if (isLocalHost) {
      return;
    }

    if (window.location.protocol === 'http:') {
      var secureUrl = 'https://' + window.location.host + window.location.pathname + window.location.search + window.location.hash;
      window.location.replace(secureUrl);
    }
  } catch (_) {
    // Keep page load resilient if browser blocks location APIs.
  }
})();
