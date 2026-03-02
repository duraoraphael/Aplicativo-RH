import http from 'http';
import url from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simulação de dados em memória (em produção, usar Firebase)
let envios = [];
let usuarios = [];

// Função para parsear o corpo da requisição
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

// CORS middleware
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  setCORSHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Rota de teste
  if (pathname === '/' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'API RH backend online!' }));
    return;
  }

  // Envio de atestados
  if (pathname === '/api/envios' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const novoEnvio = {
        id: Date.now().toString(),
        ...body,
        criado_em: new Date().toISOString(),
        arquivos: []
      };
      envios.push(novoEnvio);
      res.writeHead(200);
      res.end(JSON.stringify({ id: novoEnvio.id, success: true }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Listar atestados
  if (pathname === '/api/envios' && req.method === 'GET') {
    try {
      const data = envios.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Listar usuários pendentes
  if (pathname === '/api/usuarios/pendentes' && req.method === 'GET') {
    try {
      const data = usuarios.filter(u => u.emailVisibility === false);
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Aprovar usuário
  if (pathname.match(/^\/api\/usuarios\/aprovar\//) && req.method === 'POST') {
    try {
      const id = pathname.split('/').pop();
      const user = usuarios.find(u => u.id === id);
      if (user) {
        user.emailVisibility = true;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ id, aprovado: true }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Fallback
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Rota não encontrada' }));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✓ Servidor RH backend rodando em http://localhost:${PORT}`);
  console.log(`  - GET  http://localhost:${PORT}/`);
  console.log(`  - GET  http://localhost:${PORT}/api/envios`);
  console.log(`  - POST http://localhost:${PORT}/api/envios`);
  console.log(`  - GET  http://localhost:${PORT}/api/usuarios/pendentes`);
  console.log(`  - POST http://localhost:${PORT}/api/usuarios/aprovar/:id`);
});
