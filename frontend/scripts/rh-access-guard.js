(function rhAccessGuard() {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    var token = String(localStorage.getItem('rh_auth_token') || '').trim();
    var email = String(localStorage.getItem('rh_user_email') || '').trim();
    var pendente = localStorage.getItem('rh_user_pendente') === 'true';

    if (token && email && !pendente) {
      return;
    }

    var destino = String(window.location.pathname || '').split('/').pop() || 'rh-atestados.html';
    var query = String(window.location.search || '');
    var hash = String(window.location.hash || '');
    localStorage.setItem('rh_redirect_after_login', destino + query + hash);
    window.location.replace('rh-login.html');
  } catch {
    window.location.replace('rh-login.html');
  }
})();
