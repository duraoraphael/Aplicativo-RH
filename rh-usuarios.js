const usuariosStatus = document.getElementById('usuariosStatus');
const usuariosPendentes = document.getElementById('usuariosPendentes');
const totalPendentes = document.getElementById('totalPendentes');
const voltarPainelBtn = document.getElementById('voltarPainelBtn');
const sairRhBtn = document.getElementById('sairRhBtn');
const DEFAULT_REMOTE_BACKEND_URL = '';

function resolverBackendUrl() {
  const valorConfigurado = String(localStorage.getItem('rh_backend_url') || '').trim();

  if (valorConfigurado) {
    try {
      const url = new URL(valorConfigurado);
      const hostLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (!hostLocal && url.protocol === 'http:') {
        url.protocol = 'https:';
      }
      return url.toString().replace(/\/+$/, '');
    } catch {
      return valorConfigurado.replace(/\/+$/, '');
    }
  }

  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3001';
  }

  if (window.__RH_BACKEND_URL__) {
    return String(window.__RH_BACKEND_URL__).trim().replace(/\/+$/, '');
  }

  return DEFAULT_REMOTE_BACKEND_URL;
}

const BACKEND_URL = resolverBackendUrl();
let usuariosStatusTimer = null;

function registrarEventoBackend(acao, detalhes = {}) {
  const payload = {
    acao,
    pagina: 'rh-usuarios.html',
    email: localStorage.getItem('rh_user_email') || '',
    usuarioId: localStorage.getItem('rh_user_id') || '',
    detalhes
  };

  fetch(`${BACKEND_URL}/api/eventos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}

function setUsuariosStatus(texto, tipo = 'info') {
  if (usuariosStatusTimer) {
    clearTimeout(usuariosStatusTimer);
    usuariosStatusTimer = null;
  }

  usuariosStatus.textContent = texto;
  usuariosStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    usuariosStatus.classList.add('status-message--error');
  } else if (tipo === 'success') {
    usuariosStatus.classList.add('status-message--success');
  } else {
    usuariosStatus.classList.add('status-message--info');
  }

  if (tipo === 'success' || tipo === 'info') {
    usuariosStatusTimer = setTimeout(() => {
      usuariosStatus.textContent = '';
      usuariosStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
      usuariosStatusTimer = null;
    }, 4000);
  }
}

function formatarData(valorData) {
  if (!valorData || typeof valorData !== 'string') {
    return '-';
  }

  const data = valorData.slice(0, 10);
  const partes = data.split('-');
  if (partes.length !== 3) {
    return data;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function criarCardPendente(usuario) {
  const card = document.createElement('article');
  card.className = 'usuario-item';

  const nome = escaparHtml(usuario.nome || usuario.name || 'Sem nome');
  const email = escaparHtml(usuario.email || '-');
  const dataCadastro = escaparHtml(formatarData(usuario.criado_em || usuario.created || ''));

  card.innerHTML = `
    <div class="usuario-info">
      <div class="usuario-nome">${nome}</div>
      <div class="usuario-email">${email}</div>
      <div class="usuario-data">Cadastrado em: ${dataCadastro}</div>
    </div>
    <div class="usuario-acoes">
      <button type="button" class="btn-aprovar" data-user-id="${usuario.id}">Aprovar</button>
    </div>
  `;

  return card;
}

function obterFirestore() {
  if (typeof window?.firebase?.firestore !== 'function') {
    throw new Error('FIREBASE_NOT_LOADED');
  }
  return window.firebase.firestore();
}

async function carregarPendentes() {
  setUsuariosStatus('Carregando usuários pendentes...', 'info');
  usuariosPendentes.innerHTML = '';
  if (totalPendentes) {
    totalPendentes.textContent = '0';
  }
  try {
    // Busca usuários com status 'pendente' no Firestore
    const snapshot = await obterFirestore()
      .collection('usuarios_rh')
      .where('status', '==', 'pendente')
      .get();
    const pendentes = snapshot.docs.map((registro) => ({ id: registro.id, ...(registro.data() || {}) }));

    if (totalPendentes) {
      totalPendentes.textContent = String(pendentes.length);
    }

    if (!pendentes.length) {
      usuariosPendentes.innerHTML = '<div class="status-vazio">Nenhum usuário pendente de aprovação</div>';
      setUsuariosStatus('Nenhum usuário pendente de aprovação.', 'info');
      return;
    }
    pendentes.forEach((usuario) => {
      usuariosPendentes.appendChild(criarCardPendente(usuario));
    });
    setUsuariosStatus(`Usuários pendentes: ${pendentes.length}`, 'success');
  } catch (error) {
    setUsuariosStatus(`Erro: ${error?.message || 'Falha ao carregar usuários.'}`, 'error');
  }
}


async function aprovarUsuario(userId, botao) {
  botao.disabled = true;
  botao.textContent = 'Aprovando...';
  try {
    // Atualiza o status do usuário para 'aprovado' no Firestore
    await obterFirestore().collection('usuarios_rh').doc(String(userId)).update({ status: 'aprovado' });
    registrarEventoBackend('usuario_aprovado', { usuarioIdAprovado: userId });
    const card = botao.closest('.usuario-item');
    if (card) {
      card.remove();
    }
    const totalRestante = usuariosPendentes.querySelectorAll('.usuario-item').length;
    if (totalPendentes) {
      totalPendentes.textContent = String(totalRestante);
    }

    if (totalRestante === 0) {
      usuariosPendentes.innerHTML = '<div class="status-vazio">Nenhum usuário pendente de aprovação</div>';
    }

    setUsuariosStatus(
      totalRestante ? `Usuários pendentes: ${totalRestante}` : 'Nenhum usuário pendente de aprovação.',
      totalRestante ? 'success' : 'info'
    );
  } catch (error) {
    setUsuariosStatus(`Erro ao aprovar: ${error?.message || 'Falha ao aprovar usuário.'}`, 'error');
    botao.disabled = false;
    botao.textContent = 'Aprovar usuário';
  }
}

usuariosPendentes.addEventListener('click', (event) => {
  const botao = event.target.closest('.btn-aprovar');
  if (!botao) {
    return;
  }

  const userId = botao.dataset.userId;
  if (!userId) {
    return;
  }

  aprovarUsuario(userId, botao);
});

if (voltarPainelBtn) {
  voltarPainelBtn.addEventListener('click', () => {
    window.location.href = 'rh-atestados.html';
  });
}

if (sairRhBtn) {
  sairRhBtn.addEventListener('click', () => {
    const emailAtual = localStorage.getItem('rh_user_email') || '';
    localStorage.removeItem('rh_auth_token');
    localStorage.removeItem('rh_user_id');
    localStorage.removeItem('rh_user_email');
    localStorage.removeItem('rh_user_nome');
    localStorage.removeItem('rh_user_pendente');
    registrarEventoBackend('logout', { email: emailAtual });
    window.location.href = 'index.html';
  });
}


// Inicialização direta
registrarEventoBackend('acesso_pagina');
carregarPendentes();
