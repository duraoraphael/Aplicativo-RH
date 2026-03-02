// Configuração do Backend RH
const BACKEND_URL = 'http://localhost:3001';

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
