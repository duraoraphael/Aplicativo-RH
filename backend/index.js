import http from 'http';
import url from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

function carregarVariaveisDeAmbienteLocal() {
  const arquivoEnv = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
  if (!fs.existsSync(arquivoEnv)) {
    return;
  }

  const conteudo = fs.readFileSync(arquivoEnv, 'utf8');
  const linhas = conteudo.split(/\r?\n/);

  linhas.forEach((linha) => {
    const texto = String(linha || '').trim();
    if (!texto || texto.startsWith('#')) {
      return;
    }

    const indiceSeparador = texto.indexOf('=');
    if (indiceSeparador <= 0) {
      return;
    }

    const chave = texto.slice(0, indiceSeparador).trim();
    let valor = texto.slice(indiceSeparador + 1).trim();

    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }

    if (!process.env[chave]) {
      process.env[chave] = valor;
    }
  });
}

carregarVariaveisDeAmbienteLocal();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const USUARIOS_FILE = path.join(DATA_DIR, 'usuarios.json');
const ENVIOS_FILE = path.join(DATA_DIR, 'envios.json');
const EVENTOS_FILE = path.join(DATA_DIR, 'eventos.json');

// CONFIGURAÇÃO DE SEGURANÇA
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080'
];

const MAX_PAYLOAD_SIZE = 30 * 1024 * 1024; // 30MB
const MAX_REQUESTS_PER_MINUTE = 100;
const MAX_EVENT_REQUESTS_PER_MINUTE = 2000;
const MAX_CRITICAL_REQUESTS_PER_MINUTE = 300;
const REQUEST_TRACKER = new Map(); // IP -> { count, timestamp }

let firestoreDb = null;
let firestoreInitPromise = null;

function obterServiceAccountFirebase() {
  const valor = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!valor) {
    return null;
  }

  try {
    if (valor.startsWith('{')) {
      return JSON.parse(valor);
    }

    const caminhoCredencial = path.isAbsolute(valor)
      ? valor
      : path.join(__dirname, valor);

    if (!fs.existsSync(caminhoCredencial)) {
      console.warn(`⚠️ Credencial Firebase não encontrada: ${caminhoCredencial}`);
      return null;
    }

    const bruto = fs.readFileSync(caminhoCredencial, 'utf8');
    return JSON.parse(bruto);
  } catch (error) {
    console.warn('⚠️ Falha ao ler FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
    return null;
  }
}

async function inicializarFirestore() {
  if (firestoreInitPromise) {
    return firestoreInitPromise;
  }

  firestoreInitPromise = (async () => {
    try {
      const [{ initializeApp, cert, getApps }, { getFirestore }] = await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/firestore')
      ]);

      const serviceAccount = obterServiceAccountFirebase();
      if (!serviceAccount) {
        console.warn('⚠️ FIRESTORE desativado: credencial Firebase não configurada.');
        return null;
      }

      if (getApps().length === 0) {
        initializeApp({
          credential: cert(serviceAccount)
        });
      }

      firestoreDb = getFirestore();
      console.log('✓ Firestore inicializado.');
      return firestoreDb;
    } catch (error) {
      console.warn('⚠️ Firestore indisponível, mantendo persistência local:', error.message);
      return null;
    }
  })();

  return firestoreInitPromise;
}

async function salvarEnvioNoFirestore(envio) {
  const db = await inicializarFirestore();
  if (!db) {
    return false;
  }

  await db.collection('envios_atestados').doc(String(envio.id)).set({
    ...envio,
    origem_persistencia: 'backend-node'
  }, { merge: true });

  return true;
}

async function listarEnviosDoFirestore(limit) {
  const db = await inicializarFirestore();
  if (!db) {
    return null;
  }

  const snapshot = await db
    .collection('envios_atestados')
    .orderBy('criado_em', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const registro = doc.data() || {};
    const { criado_por_ip, ...rest } = registro;
    return {
      id: doc.id,
      ...rest
    };
  });
}

function garantirDiretorioDados() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function sanitizarNomeArquivo(nomeArquivo = 'arquivo.pdf') {
  const nomeSeguro = String(nomeArquivo)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return nomeSeguro || 'arquivo.pdf';
}

function montarBaseUrl(req) {
  const protocolo = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host || `localhost:${process.env.PORT || 3001}`;
  return `${protocolo}://${host}`;
}

function salvarArquivosDoEnvio(req, envioId, arquivosEntrada) {
  if (!Array.isArray(arquivosEntrada) || arquivosEntrada.length === 0) {
    return [];
  }

  const baseUrl = montarBaseUrl(req);
  const urls = [];

  arquivosEntrada.forEach((arquivo, indice) => {
    if (!arquivo || typeof arquivo !== 'object') {
      return;
    }

    const nomeOriginal = sanitizarNomeArquivo(arquivo.nome || `anexo-${indice + 1}.pdf`);
    const mimeType = String(arquivo.tipo || 'application/pdf');
    const conteudoBase64 = String(arquivo.conteudoBase64 || '');
    if (!conteudoBase64) {
      return;
    }

    let base64 = conteudoBase64;
    const dataUrlMatch = conteudoBase64.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataUrlMatch) {
      base64 = dataUrlMatch[2];
    }

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      return;
    }

    const extensao = path.extname(nomeOriginal) || (mimeType.includes('pdf') ? '.pdf' : '');
    const nomeBase = path.basename(nomeOriginal, extensao || undefined);
    const nomeFinal = `${envioId}-${indice + 1}-${Date.now()}-${nomeBase}${extensao}`;
    const caminhoArquivo = path.join(UPLOADS_DIR, nomeFinal);

    fs.writeFileSync(caminhoArquivo, buffer);
    urls.push(`${baseUrl}/uploads/${encodeURIComponent(nomeFinal)}`);
  });

  return urls;
}

function carregarLista(arquivo) {
  try {
    if (!fs.existsSync(arquivo)) return [];
    const bruto = fs.readFileSync(arquivo, 'utf8');
    const parsed = JSON.parse(bruto || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`Falha ao carregar ${arquivo}:`, err.message);
    return [];
  }
}

function salvarLista(arquivo, dados) {
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), 'utf8');
}

garantirDiretorioDados();

let envios = carregarLista(ENVIOS_FILE);
let usuarios = carregarLista(USUARIOS_FILE);
let eventos = carregarLista(EVENTOS_FILE);

// Rate Limiting
function verificarRateLimit(chave, limitePorMinuto = MAX_REQUESTS_PER_MINUTE) {
  const agora = Date.now();
  const minutoAtras = agora - 60000;
  
  if (!REQUEST_TRACKER.has(chave)) {
    REQUEST_TRACKER.set(chave, { count: 1, timestamp: agora });
    return true;
  }
  
  const registro = REQUEST_TRACKER.get(chave);
  if (registro.timestamp < minutoAtras) {
    REQUEST_TRACKER.set(chave, { count: 1, timestamp: agora });
    return true;
  }
  
  if (registro.count >= limitePorMinuto) {
    return false;
  }
  
  registro.count++;
  return true;
}

// Validação de entrada
function validarAtestado(dados) {
  const erros = [];
  
  if (!dados.nome || typeof dados.nome !== 'string' || dados.nome.trim().length === 0) {
    erros.push('Nome é obrigatório');
  } else if (dados.nome.length > 150) {
    erros.push('Nome muito longo (máx 150 caracteres)');
  }
  
  if (!dados.funcao || typeof dados.funcao !== 'string' || dados.funcao.trim().length === 0) {
    erros.push('Função é obrigatória');
  } else if (dados.funcao.length > 100) {
    erros.push('Função muito longa (máx 100 caracteres)');
  }
  
  if (!dados.projeto || typeof dados.projeto !== 'string' || dados.projeto.trim().length === 0) {
    erros.push('Projeto é obrigatório');
  } else if (dados.projeto.length > 100) {
    erros.push('Projeto muito longo (máx 100 caracteres)');
  }
  
  if (!dados.tipo_atestado || typeof dados.tipo_atestado !== 'string') {
    erros.push('Tipo de atestado é obrigatório');
  }
  
  // Validar datas
  const dataInicio = new Date(dados.data_inicio);
  const dataFim = new Date(dados.data_fim);
  
  if (isNaN(dataInicio.getTime())) {
    erros.push('Data de início inválida');
  }
  
  if (isNaN(dataFim.getTime())) {
    erros.push('Data de fim inválida');
  }
  
  if (dataFim < dataInicio) {
    erros.push('Data de fim não pode ser antes de data de início');
  }
  
  if (typeof dados.dias !== 'number' || dados.dias < 1 || dados.dias > 365) {
    erros.push('Dias deve ser entre 1 e 365');
  }
  
  return erros;
}

function normalizarTextoCurto(valor, limite = 120) {
  return String(valor || '').trim().slice(0, limite);
}

// Função para parsear o corpo da requisição com limite
function parseBody(req, maxSize = MAX_PAYLOAD_SIZE) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error('Payload muito grande'));
        return;
      }
      data += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('JSON inválido'));
      }
    });
    
    req.on('error', (err) => {
      reject(err);
    });
  });
}

// Obter IP do cliente
function obterIpCliente(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         'unknown';
}

// CORS middleware com whitelist
function setCORSHeaders(res, origem) {
  const origemEhLocalhost = typeof origem === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origem);
  const origemPermitida = ALLOWED_ORIGINS.includes(origem) || origemEhLocalhost;

  if (origemPermitida && origem !== 'unknown') {
    res.setHeader('Access-Control-Allow-Origin', origem);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '3600');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  const origem = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/') || 'unknown';
  const ip = obterIpCliente(req);
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  setCORSHeaders(res, origem);

  // Verificar rate limit
  const ehRotaEvento = pathname === '/api/eventos';
  const chaveRateLimit = ehRotaEvento ? `${ip}:eventos` : `${ip}:geral`;
  const limiteRateLimit = ehRotaEvento ? MAX_EVENT_REQUESTS_PER_MINUTE : MAX_CRITICAL_REQUESTS_PER_MINUTE;

  if (!verificarRateLimit(chaveRateLimit, limiteRateLimit)) {
    res.writeHead(429);
    res.end(JSON.stringify({ error: 'Muitas requisições. Tente novamente em alguns minutos.' }));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    if (pathname.startsWith('/uploads/') && req.method === 'GET') {
      const nomeArquivo = decodeURIComponent(pathname.replace('/uploads/', ''));
      if (!nomeArquivo || nomeArquivo.includes('..') || nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Arquivo inválido' }));
        return;
      }

      const caminhoArquivo = path.join(UPLOADS_DIR, nomeArquivo);
      if (!fs.existsSync(caminhoArquivo)) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Arquivo não encontrado' }));
        return;
      }

      const ext = path.extname(caminhoArquivo).toLowerCase();
      const contentType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${nomeArquivo.replace(/"/g, '')}"`);
      fs.createReadStream(caminhoArquivo).pipe(res);
      return;
    }

    // Rota de teste
    if (pathname === '/' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'API RH backend online!' }));
      return;
    }

    // Envio de atestados
    if (pathname === '/api/envios' && req.method === 'POST') {
      const body = await parseBody(req);
      
      // Validar dados
      const erros = validarAtestado(body);
      if (erros.length > 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Validação falhou', detalhes: erros }));
        return;
      }
      
      const novoEnvio = {
        id: Date.now().toString(),
        nome: body.nome.trim(),
        funcao: body.funcao.trim(),
        projeto: body.projeto.trim(),
        tipo_atestado: body.tipo_atestado,
        data_inicio: body.data_inicio,
        data_fim: body.data_fim,
        dias: body.dias,
        horas_comparecimento: body.horas_comparecimento || '',
        criado_em: new Date().toISOString(),
        criado_por_ip: ip,
        arquivos: []
      };

      const arquivosSalvos = salvarArquivosDoEnvio(req, novoEnvio.id, body.arquivos);
      if (arquivosSalvos.length > 0) {
        novoEnvio.arquivos = arquivosSalvos;
      }

      envios.push(novoEnvio);
      salvarLista(ENVIOS_FILE, envios);

      let salvoNoFirestore = false;
      try {
        salvoNoFirestore = await salvarEnvioNoFirestore(novoEnvio);
      } catch (firestoreError) {
        console.warn('Falha ao gravar envio no Firestore:', firestoreError.message);
      }

      res.writeHead(201);
      res.end(JSON.stringify({
        id: novoEnvio.id,
        success: true,
        arquivos: novoEnvio.arquivos,
        firestore: salvoNoFirestore
      }));
      return;
    }

    // Listar atestados
    if (pathname === '/api/envios' && req.method === 'GET') {
      const limit = Math.min(parseInt(parsedUrl.query.limit) || 100, 1000);

      let data = null;
      try {
        data = await listarEnviosDoFirestore(limit);
      } catch (firestoreError) {
        console.warn('Falha ao listar envios do Firestore, usando base local:', firestoreError.message);
      }

      if (!Array.isArray(data)) {
        data = envios
          .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
          .slice(0, limit)
          .map(({ criado_por_ip, ...rest }) => rest);
      }
      
      res.writeHead(200);
      res.end(JSON.stringify(data));
      return;
    }

    // Listar usuários pendentes
    if (pathname === '/api/usuarios/pendentes' && req.method === 'GET') {
      const data = usuarios
        .filter(u => u.aprovado === false)
        .map(({ ...rest }) => rest);
      
      res.writeHead(200);
      res.end(JSON.stringify(data));
      return;
    }

    // Registrar evento de uso do frontend
    if (pathname === '/api/eventos' && req.method === 'POST') {
      const body = await parseBody(req);
      const acao = normalizarTextoCurto(body.acao, 80);
      const pagina = normalizarTextoCurto(body.pagina, 120);

      if (!acao) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Ação é obrigatória' }));
        return;
      }

      const novoEvento = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        acao,
        pagina,
        email: normalizarTextoCurto(body.email, 150),
        usuario_id: normalizarTextoCurto(body.usuarioId, 80),
        detalhes: body.detalhes && typeof body.detalhes === 'object' ? body.detalhes : {},
        criado_em: new Date().toISOString(),
        criado_por_ip: ip,
        user_agent: normalizarTextoCurto(req.headers['user-agent'] || '', 300)
      };

      eventos.push(novoEvento);
      if (eventos.length > 5000) {
        eventos = eventos.slice(eventos.length - 5000);
      }

      salvarLista(EVENTOS_FILE, eventos);
      res.writeHead(201);
      res.end(JSON.stringify({ success: true, id: novoEvento.id }));
      return;
    }

    // Listar eventos de uso
    if (pathname === '/api/eventos' && req.method === 'GET') {
      const limit = Math.min(parseInt(parsedUrl.query.limit) || 200, 1000);
      const data = eventos
        .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
        .slice(0, limit)
        .map(({ criado_por_ip, ...rest }) => rest);

      res.writeHead(200);
      res.end(JSON.stringify(data));
      return;
    }

    // Verificar se usuário existe por e-mail
    if (pathname === '/api/usuarios/existe' && req.method === 'GET') {
      const email = (parsedUrl.query.email || '').toString().trim().toLowerCase();

      if (!email) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Email é obrigatório' }));
        return;
      }

      const usuario = usuarios.find(u => u.email === email);
      if (!usuario) {
        res.writeHead(200);
        res.end(JSON.stringify({ existe: false }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        existe: true,
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        aprovado: !!usuario.aprovado
      }));
      return;
    }

    // Criar novo usuário (cadastro)
    if (pathname === '/api/usuarios' && req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const erros = [];

        if (!body.email || typeof body.email !== 'string' || body.email.trim().length === 0) {
          erros.push('Email é obrigatório');
        }

        if (!body.nome || typeof body.nome !== 'string' || body.nome.trim().length === 0) {
          erros.push('Nome é obrigatório');
        }

        if (erros.length > 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ erros }));
          return;
        }

        // Verificar se usuário já existe
        const usuarioExistente = usuarios.find(u => u.email === body.email);
        if (usuarioExistente) {
          if (usuarioExistente.aprovado) {
            res.writeHead(200);
            res.end(JSON.stringify({ id: usuarioExistente.id, status: 'aprovado', mensagem: 'Usuário já está aprovado' }));
          } else {
            res.writeHead(202);
            res.end(JSON.stringify({ id: usuarioExistente.id, status: 'pendente', mensagem: 'Cadastro aguardando aprovação' }));
          }
          return;
        }

        // Criar novo usuário (pendente de aprovação)
        const novoUsuario = {
          id: Date.now().toString(),
          email: body.email.trim().toLowerCase(),
          nome: body.nome.trim(),
          departamento: body.departamento || '',
          cargo: body.cargo || '',
          aprovado: false,
          criado_em: new Date().toISOString(),
          criado_por_ip: ip
        };

        usuarios.push(novoUsuario);
        salvarLista(USUARIOS_FILE, usuarios);
        res.writeHead(202);
        res.end(JSON.stringify({ id: novoUsuario.id, status: 'pendente', mensagem: 'Cadastro realizado e aguardando aprovação do administrador.' }));
        return;
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }

    // Aprovar usuário (NOTA: Implementar autenticação aqui em produção)
    if (pathname.match(/^\/api\/usuarios\/aprovar\//) && req.method === 'POST') {
      const id = pathname.split('/').pop();
      
      if (!id || id.length > 50) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'ID inválido' }));
        return;
      }
      
      const user = usuarios.find(u => u.id === id);
      if (user) {
        user.aprovado = true;
        salvarLista(USUARIOS_FILE, usuarios);
        res.writeHead(200);
        res.end(JSON.stringify({ id, aprovado: true, mensagem: 'Usuário aprovado com sucesso' }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Usuário não encontrado' }));
      return;
    }

    // Rejeitar usuário
    if (pathname.match(/^\/api\/usuarios\/rejeitar\//) && req.method === 'POST') {
      const id = pathname.split('/').pop();
      
      if (!id || id.length > 50) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'ID inválido' }));
        return;
      }
      
      const idx = usuarios.findIndex(u => u.id === id);
      if (idx !== -1) {
        usuarios.splice(idx, 1);
        salvarLista(USUARIOS_FILE, usuarios);
        res.writeHead(200);
        res.end(JSON.stringify({ id, rejeitado: true, mensagem: 'Usuário removido' }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Usuário não encontrado' }));
      return;
    }

    // Health check
    if (pathname === '/api/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }

    // Fallback
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Rota não encontrada' }));
  } catch (err) {
    console.error('Erro:', err.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  inicializarFirestore();
  console.log(`✓ Servidor RH backend rodando em http://localhost:${PORT}`);
  console.log(`\nEndpoints disponíveis:`);
  console.log(`  - GET  /api/health`);
  console.log(`  - GET  /api/envios?limit=100`);
  console.log(`  - POST /api/envios`);
  console.log(`  - GET  /api/eventos?limit=200`);
  console.log(`  - POST /api/eventos`);
  console.log(`  - GET  /api/usuarios/pendentes`);
  console.log(`  - GET  /api/usuarios/existe?email=...`);
  console.log(`  - POST /api/usuarios (cadastro)`);
  console.log(`  - POST /api/usuarios/aprovar/:id`);
  console.log(`  - POST /api/usuarios/rejeitar/:id`);
  console.log(`\n⚠️ SEGURANÇA ATIVA:`);
  console.log(`  - CORS: Whitelist ${ALLOWED_ORIGINS.length} origens`);
  console.log(`  - Rate limit: ${MAX_REQUESTS_PER_MINUTE} req/min por IP`);
  console.log(`  - Tamanho máximo: ${MAX_PAYLOAD_SIZE / 1024 / 1024}MB`);
});
