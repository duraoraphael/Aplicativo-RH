// Configuração do Backend RH
//const BACKEND_URL = '';

const DEFAULT_REMOTE_BACKEND_URL = '';

function resolverBackendUrl() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return DEFAULT_REMOTE_BACKEND_URL;
  }

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

// APIs disponíveis
const API = {
  // Atestados
  criarAtestado: async (dados) => {
    const response = await fetch(`${BACKEND_URL}/api/envios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    return response.json();
  },

  listarAtestados: async () => {
    const response = await fetch(`${BACKEND_URL}/api/envios`);
    return response.json();
  },

  // Usuários
  listarUsuariosPendentes: async () => {
    const response = await fetch(`${BACKEND_URL}/api/usuarios/pendentes`);
    return response.json();
  },

  aprovarUsuario: async (usuarioId) => {
    const response = await fetch(`${BACKEND_URL}/api/usuarios/aprovar/${usuarioId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  }
};

// Testes de conectividade
export async function testarConexaoBackend() {
  try {
    const response = await fetch(`${BACKEND_URL}/`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

export default API;
