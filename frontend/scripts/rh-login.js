const microsoftLoginBtn = document.getElementById('microsoftLoginBtn');
const microsoftRegisterBtn = document.getElementById('microsoftRegisterBtn');
const loginMensagem = document.getElementById('loginMensagem');

function definirMensagem(texto, tipo = 'info') {
  if (!loginMensagem) return;

  loginMensagem.textContent = texto;
  loginMensagem.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    loginMensagem.classList.add('status-message--error');
  } else if (tipo === 'success') {
    loginMensagem.classList.add('status-message--success');
  } else {
    loginMensagem.classList.add('status-message--info');
  }
}

function redirecionarParaSeletor(modo) {
  localStorage.setItem('rh_redirect_after_login', 'rh-atestados.html');
  window.location.href = `account-selector.html?modo=${encodeURIComponent(modo)}&v=20260306e`;
}

function inicializarEstadoSessao() {
  const token = localStorage.getItem('rh_auth_token');
  const pendente = localStorage.getItem('rh_user_pendente') === 'true';

  if (pendente) {
    definirMensagem('Seu cadastro está pendente de aprovação do administrador.', 'info');
    return;
  }

  if (token) {
    definirMensagem('Sessão ativa encontrada. Redirecionando...', 'success');
    setTimeout(() => {
      window.location.href = 'rh-atestados.html';
    }, 600);
  }
}

if (microsoftLoginBtn) {
  microsoftLoginBtn.addEventListener('click', () => {
    redirecionarParaSeletor('login');
  });
}

if (microsoftRegisterBtn) {
  microsoftRegisterBtn.addEventListener('click', () => {
    redirecionarParaSeletor('cadastro');
  });
}

inicializarEstadoSessao();
