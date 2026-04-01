async function registrarEventoBackend(acao, detalhes = {}) {
  if (typeof firebase === 'undefined') {
    return;
  }

  try {
    await firebase.firestore().collection('eventos_frontend').add({
      acao,
      pagina: 'rh-atestados.html',
      email: localStorage.getItem('rh_user_email') || '',
      usuarioId: localStorage.getItem('rh_user_id') || '',
      detalhes,
      criado_em: new Date().toISOString()
    });
  } catch {
    // Mantem a navegação mesmo sem log de evento.
  }
}

const RH_PROJETO_CODIGO_KEY = 'rh_projeto_codigo';
const RH_PROJETO_ORIGEM_KEY = 'rh_projeto_origem';

function fazerLogout() {
  const emailAtual = localStorage.getItem('rh_user_email') || '';
  localStorage.removeItem('rh_auth_token');
  localStorage.removeItem('rh_user_id');
  localStorage.removeItem('rh_user_email');
  localStorage.removeItem('rh_user_nome');
  localStorage.removeItem('rh_user_pendente');
  registrarEventoBackend('logout', { email: emailAtual });
  window.location.href = 'index.html';
}

function irParaAdmin() {
  registrarEventoBackend('abrir_admin');
  window.location.href = 'rh-admin.html';
}

function irParaDashboardDemandas() {
  registrarEventoBackend('abrir_dashboard_demandas');
  window.location.href = 'rh-demandas.html';
}

function abrirProjetoEmNovaAba(codigoProjeto) {
  sessionStorage.setItem(RH_PROJETO_CODIGO_KEY, String(codigoProjeto || '').trim());
  sessionStorage.setItem(RH_PROJETO_ORIGEM_KEY, 'rh-atestados.html');
  registrarEventoBackend('abrir_projeto', { projeto: codigoProjeto });
  window.location.href = 'rh-projeto.html';
}

window.fazerLogout = fazerLogout;
window.irParaAdmin = irParaAdmin;
window.irParaDashboardDemandas = irParaDashboardDemandas;
window.abrirProjetoEmNovaAba = abrirProjetoEmNovaAba;

registrarEventoBackend('acesso_pagina');
