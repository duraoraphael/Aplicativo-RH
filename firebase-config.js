
// Firebase Config - Interface simplificada

// Simula o Firebase Firestore  
const db = {
  // Placeholder para compatibilidade
};

// Simula o Firebase Auth
const auth = {
  // Placeholder para compatibilidade  
};

// API wrapper para chamar o backend Node.js
const backendAPI = {
  baseUrl: 'http://localhost:3001',

  async listarAtestados() {
    try {
      const response = await fetch(`${this.baseUrl}/api/envios`);
      if (!response.ok) throw new Error('Falha ao listar atestados');
      return await response.json();
    } catch (error) {
      console.error('Erro ao listar atestados:', error);
      return [];
    }
  },

  async criarAtestado(dados) {
    try {
      const formData = new FormData();
      Object.keys(dados).forEach(key => {
        if (Array.isArray(dados[key])) {
          dados[key].forEach(file => formData.append(key, file));
        } else {
          formData.append(key, dados[key]);
        }
      });

      const response = await fetch(`${this.baseUrl}/api/envios`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Falha ao criar atestado');
      return await response.json();
    } catch (error) {
      console.error('Erro ao criar atestado:', error);
      throw error;
    }
  },

  async listarUsuariosPendentes() {
    try {
      const response = await fetch(`${this.baseUrl}/api/usuarios/pendentes`);
      if (!response.ok) throw new Error('Falha ao listar usuários');
      return await response.json();
    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      return [];
    }
  },

  async aprovarUsuario(usuarioId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/usuarios/aprovar/${usuarioId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Falha ao aprovar usuário');
      return await response.json();
    } catch (error) {
      console.error('Erro ao aprovar usuário:', error);
      throw error;
    }
  }
};

// Firestore stubs
const getDocs = async (query) => {
  // Chamará o backend
  const dados = await backendAPI.listarAtestados();
  return {
    docs: dados.map(doc => ({
      id: doc.id,
      data: () => doc
    }))
  };
};

const collection = (db, name) => {
  return { type: 'collection', name };
};

const query = (...args) => {
  return { type: 'query', args };
};

const where = (field, operator, value) => {
  return { type: 'where', field, operator, value };
};

// Storage stubs
const getStorage = () => ({});
const ref = (storage, path) => ({});
const getDownloadURL = async (ref) => '';

export { 
  db, 
  auth, 
  getDocs, 
  collection, 
  query, 
  where, 
  getStorage, 
  ref, 
  getDownloadURL,
  backendAPI
};
