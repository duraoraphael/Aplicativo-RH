const BACKEND_URL = 'http://localhost:3001';

// Variáveis globais - serão inicializadas quando DOM carregar
let microsoftLoginBtn = null;
let microsoftRegisterBtn = null;
let loginMensagem = null;
let usuarioLogado = null;
let loginMensagemTimer = null;

function inicializarElementos() {
  microsoftLoginBtn = document.getElementById('microsoftLoginBtn');
  microsoftRegisterBtn = document.getElementById('microsoftRegisterBtn');
  loginMensagem = document.getElementById('loginMensagem');
  
  console.log('✅ Elementos DOM inicializados:', {
    loginBtn: !!microsoftLoginBtn,
    registerBtn: !!microsoftRegisterBtn,
    mensagem: !!loginMensagem
  });
}

function definirMensagem(texto, erro = false) {
  if (!loginMensagem) return;

  if (loginMensagemTimer) {
    clearTimeout(loginMensagemTimer);
    loginMensagemTimer = null;
  }

  loginMensagem.textContent = texto;
  loginMensagem.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  loginMensagem.classList.add(erro ? 'status-message--error' : 'status-message--success');

  if (!erro) {
    loginMensagemTimer = setTimeout(() => {
      if (!loginMensagem) return;
      loginMensagem.textContent = '';
      loginMensagem.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
      loginMensagemTimer = null;
    }, 4000);
  }
}

function obterTokenArmazenado() {
  return localStorage.getItem('rh_auth_token');
}

function obterEmailArmazenado() {
  return localStorage.getItem('rh_user_email');
}

function obterNomeArmazenado() {
  return localStorage.getItem('rh_user_nome');
}

function obterIdArmazenado() {
  return localStorage.getItem('rh_user_id');
}

function obterStatusPendente() {
  return localStorage.getItem('rh_user_pendente') === 'true';
}

function armazenarDadosUsuario(id, email, nome, token, pendente = false) {
  localStorage.setItem('rh_auth_token', token);
  localStorage.setItem('rh_user_id', id);
  localStorage.setItem('rh_user_email', email);
  localStorage.setItem('rh_user_nome', nome);
  localStorage.setItem('rh_user_pendente', pendente ? 'true' : 'false');
  usuarioLogado = { id, email, nome, token, pendente };
}

function limparToken() {
  localStorage.removeItem('rh_auth_token');
  localStorage.removeItem('rh_user_id');
  localStorage.removeItem('rh_user_email');
  localStorage.removeItem('rh_user_nome');
  localStorage.removeItem('rh_user_pendente');
  usuarioLogado = null;
}

async function verificarBackend() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/health`, { method: 'GET' });
    return resp.ok;
  } catch (err) {
    console.error('Backend offline:', err);
    return false;
  }
}

async function inicializarSessao() {
  const tokenExistente = obterTokenArmazenado();
  
  if (tokenExistente) {
    const email = obterEmailArmazenado();
    const nome = obterNomeArmazenado();
    const pendente = obterStatusPendente();
    
    console.log('✅ Sessão existente encontrada:', { email, pending: pendente });
    
    if (pendente) {
      definirMensagem('⏳ Seu cadastro está aguardando aprovação do administrador');
      microsoftLoginBtn.disabled = true;
      microsoftRegisterBtn.disabled = true;
    } else {
      definirMensagem('✅ Bem-vindo! Redirecionando...');
      setTimeout(() => {
        window.location.href = 'rh-atestados.html';
      }, 1000);
    }
    return;
  }
}

async function cadastrarUsuario(email, nome) {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        nome,
        departamento: 'RH',
        cargo: 'Colaborador'
      })
    });

    const dados = await resp.json();

    if (resp.status === 201) {
      // Novo cadastro criado - auto-login
      const token = 'registered_' + Math.random().toString(36).substr(2, 9);
      armazenarDadosUsuario(dados.id, email, nome, token, false);
      
      definirMensagem('✅ Cadastro realizado! Fazendo login...');
      setTimeout(() => {
        window.location.href = 'rh-atestados.html';
      }, 1000);
      return true;
    } else if (resp.status === 202) {
      // Usuário já existe e está pendente
      const token = 'pending_' + Math.random().toString(36).substr(2, 9);
      armazenarDadosUsuario(dados.id, email, nome, token, true);
      
      definirMensagem('⏳ Seu cadastro já existe e está aguardando aprovação');
      microsoftLoginBtn.disabled = true;
      microsoftRegisterBtn.disabled = true;
      return false;
    } else if (resp.status === 200) {
      // Usuário já está aprovado
      const token = 'approved_' + Math.random().toString(36).substr(2, 9);
      armazenarDadosUsuario(dados.id, email, nome, token, false);
      
      definirMensagem('✅ Bem-vindo! Redirecionando...');
      setTimeout(() => {
        window.location.href = 'rh-atestados.html';
      }, 1000);
      return true;
    }
  } catch (err) {
    console.error('Erro no cadastro:', err);
    definirMensagem(`❌ Erro ao cadastrar: ${err.message}`, true);
    return false;
  }
}

async function autenticarMicrosoft(modoCadastro = false) {
  const backendOk = await verificarBackend();
  if (!backendOk) {
    definirMensagem('⚠️ Backend offline. Reinicie o servidor Node.js e tente novamente.', true);
    return;
  }

  microsoftLoginBtn.disabled = true;
  microsoftRegisterBtn.disabled = true;

  // Simulação: usar email fictício baseado no modo
  const emailSimulado = modoCadastro 
    ? `usuario_${Date.now()}@normatel.com.br`
    : `user_${Date.now()}@normatel.com.br`;
  
  const nomeSimulado = modoCadastro 
    ? `Novo Usuário ${Math.floor(Math.random() * 1000)}`
    : `Usuário ${Math.floor(Math.random() * 1000)}`;

  if (modoCadastro) {
    console.log('🔄 Iniciando cadastro com Microsoft...');
    definirMensagem('🔄 Registrando novo usuário...');
    await cadastrarUsuario(emailSimulado, nomeSimulado);
  } else {
    console.log('🔄 Tentando fazer login...');
    definirMensagem('🔄 Verificando cadastro...');
    
    // Simular login de usuário já cadastrado
    const token = 'login_' + Math.random().toString(36).substr(2, 9);
    armazenarDadosUsuario(Date.now().toString(), emailSimulado, nomeSimulado, token, false);
    
    definirMensagem('✅ Login bem-sucedido! Redirecionando...');
    setTimeout(() => {
      window.location.href = 'rh-atestados.html';
    }, 1000);
  }

  microsoftLoginBtn.disabled = false;
  microsoftRegisterBtn.disabled = false;
}

// Event Listeners
function adicionarEventListeners() {
  if (microsoftLoginBtn) {
    microsoftLoginBtn.addEventListener('click', () => {
      console.log('🔵 Botão "Entrar com Microsoft" clicado');
      autenticarMicrosoft(false);
    });
  } else {
    console.warn('⚠️ microsoftLoginBtn não encontrado');
  }

  if (microsoftRegisterBtn) {
    microsoftRegisterBtn.addEventListener('click', () => {
      console.log('🔵 Botão "Cadastrar com Microsoft" clicado');
      autenticarMicrosoft(true);
    });
  } else {
    console.warn('⚠️ microsoftRegisterBtn não encontrado');
  }
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOMContentLoaded disparado');
    inicializarElementos();
    adicionarEventListeners();
    inicializarSessao();
  });
} else {
  // DOM já carregado
  console.log('✅ DOM já estava carregado');
  inicializarElementos();
  adicionarEventListeners();
  inicializarSessao();
}

