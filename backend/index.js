import http from 'http';
import https from 'https';
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
const FIRESTORE_COLLECTIONS = {
  envios: 'envios_atestados',
  usuarios: 'usuarios_rh',
  eventos: 'eventos_frontend'
};

// CONFIGURAÇÃO DE SEGURANÇA
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  // 'http://localhost:8080' // removido: não usar emulador
  'https://aplicativo-rh-pb-normatel.fly.dev',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim().replace(/\/+$/, '')] : []),
];

const MAX_PAYLOAD_SIZE = 30 * 1024 * 1024; // 30MB
const MAX_REQUESTS_PER_MINUTE = 100;
const MAX_EVENT_REQUESTS_PER_MINUTE = 2000;
const MAX_CRITICAL_REQUESTS_PER_MINUTE = 300;
const REQUEST_TRACKER = new Map(); // IP -> { count, timestamp }

let firestoreDb = null;
let firestoreInitPromise = null;
let firebaseStorage = null;
let firebaseStorageBucket = '';

function obterServiceAccountFirebase() {
  const valor = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (valor) {
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

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyBruta = String(process.env.FIREBASE_PRIVATE_KEY || '').trim();

  if (!projectId || !clientEmail || !privateKeyBruta) {
    return null;
  }

  const privateKey = privateKeyBruta.replace(/\\n/g, '\n');

  return {
    type: 'service_account',
    project_id: projectId,
    private_key: privateKey,
    client_email: clientEmail
  };
}

async function inicializarFirestore() {
  if (firestoreInitPromise) {
    return firestoreInitPromise;
  }

  firestoreInitPromise = (async () => {
    try {
      const [{ initializeApp, cert, applicationDefault, getApps }, { getFirestore }] = await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/firestore')
      ]);

      const { getStorage } = await import('firebase-admin/storage');

      const serviceAccount = obterServiceAccountFirebase();
      const bucketConfigurado = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();
      const projectIdDetectado = serviceAccount?.project_id
        || String(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '').trim();
      const bucketPadrao = projectIdDetectado ? `${projectIdDetectado}.appspot.com` : '';
      firebaseStorageBucket = bucketConfigurado || bucketPadrao;

      if (getApps().length === 0) {
        const credencialFirebase = serviceAccount
          ? cert(serviceAccount)
          : applicationDefault();

        initializeApp({
          credential: credencialFirebase,
          ...(firebaseStorageBucket ? { storageBucket: firebaseStorageBucket } : {})
        });
      }

      if (!serviceAccount) {
        console.log('ℹ️ Firebase inicializado com credencial automática do ambiente (Application Default Credentials).');
      }

      firestoreDb = getFirestore();
      firebaseStorage = getStorage();
      console.log('✓ Firestore inicializado.');
      if (firebaseStorageBucket) {
        console.log(`✓ Firebase Storage inicializado (${firebaseStorageBucket}).`);
      } else {
        console.warn('⚠️ FIREBASE_STORAGE_BUCKET não definido. Upload de anexos será bloqueado.');
      }
      return firestoreDb;
    } catch (error) {
      console.warn('⚠️ Firestore/Firebase Storage indisponível:', error.message);
      return null;
    }
  })();

  return firestoreInitPromise;
}

async function salvarEnvioNoFirestore(envio) {
  const db = await obterFirestoreObrigatorio();
  await db.collection(FIRESTORE_COLLECTIONS.envios).doc(String(envio.id)).set({
    ...envio,
    origem_persistencia: 'backend-node'
  }, { merge: true });
}

async function atualizarStatusAtendimentoEnvioFirestore(id, atendimentoStatus) {
  const db = await obterFirestoreObrigatorio();
  const ref = db.collection(FIRESTORE_COLLECTIONS.envios).doc(String(id));
  const doc = await ref.get();

  if (!doc.exists) {
    return false;
  }

  await ref.set({
    atendimento_status: atendimentoStatus,
    atendimento_atualizado_em: new Date().toISOString()
  }, { merge: true });

  return true;
}

async function excluirEnvioFirestore(id) {
  const db = await obterFirestoreObrigatorio();
  const ref = db.collection(FIRESTORE_COLLECTIONS.envios).doc(String(id));
  const doc = await ref.get();

  if (!doc.exists) {
    return false;
  }

  await ref.delete();
  return true;
}

async function obterFirestoreObrigatorio() {
  const db = await inicializarFirestore();
  if (!db) {
    throw new Error('FIRESTORE_NOT_CONFIGURED');
  }

  return db;
}

async function obterStorageObrigatorio() {
  await obterFirestoreObrigatorio();
  if (!firebaseStorage) {
    throw new Error('FIREBASE_STORAGE_NOT_CONFIGURED');
  }

  if (!firebaseStorageBucket) {
    throw new Error('FIREBASE_STORAGE_BUCKET_MISSING');
  }

  return firebaseStorage.bucket(firebaseStorageBucket);
}

async function listarEnviosDoFirestore(limit) {
  const db = await obterFirestoreObrigatorio();

  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.envios)
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

async function salvarEventoNoFirestore(evento) {
  const db = await obterFirestoreObrigatorio();
  await db.collection(FIRESTORE_COLLECTIONS.eventos).doc(String(evento.id)).set({
    ...evento,
    origem_persistencia: 'backend-node'
  }, { merge: true });
}

async function listarEventosDoFirestore(limit) {
  const db = await obterFirestoreObrigatorio();
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.eventos)
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

async function obterUsuarioPorEmailFirestore(email) {
  const db = await obterFirestoreObrigatorio();
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.usuarios)
    .where('email', '==', String(email || '').trim().toLowerCase())
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...(doc.data() || {})
  };
}

async function listarUsuariosPendentesFirestore() {
  const db = await obterFirestoreObrigatorio();
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.usuarios)
    .where('aprovado', '==', false)
    .orderBy('criado_em', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const { criado_por_ip, ...rest } = (doc.data() || {});
    return {
      id: doc.id,
      ...rest
    };
  });
}

async function criarUsuarioFirestore(usuario) {
  const db = await obterFirestoreObrigatorio();
  await db.collection(FIRESTORE_COLLECTIONS.usuarios).doc(String(usuario.id)).set(usuario, { merge: false });
}

async function aprovarUsuarioFirestore(id) {
  const db = await obterFirestoreObrigatorio();
  const ref = db.collection(FIRESTORE_COLLECTIONS.usuarios).doc(String(id));
  const doc = await ref.get();

  if (!doc.exists) {
    return false;
  }

  await ref.set({
    aprovado: true,
    atualizado_em: new Date().toISOString()
  }, { merge: true });

  return true;
}

async function rejeitarUsuarioFirestore(id) {
  const db = await obterFirestoreObrigatorio();
  const ref = db.collection(FIRESTORE_COLLECTIONS.usuarios).doc(String(id));
  const doc = await ref.get();

  if (!doc.exists) {
    return false;
  }

  await ref.delete();
  return true;
}

function sanitizarNomeArquivo(nomeArquivo = 'arquivo.pdf') {
  const nomeSeguro = String(nomeArquivo)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return nomeSeguro || 'arquivo.pdf';
}

function urlProxyPermitida(urlArquivo) {
  try {
    const parsed = new URL(String(urlArquivo || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const host = String(parsed.hostname || '').toLowerCase();
    return host === 'firebasestorage.googleapis.com' || host === 'storage.googleapis.com';
  } catch {
    return false;
  }
}

function baixarArquivoRemoto(urlArquivo, redirecionamentosRestantes = 3) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(String(urlArquivo || ''));
    } catch {
      reject(new Error('URL inválida para proxy'));
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const cliente = isHttps ? https : http;
    const req = cliente.request(parsed, {
      method: 'GET',
      headers: {
        'User-Agent': 'rh-backend-proxy/1.0'
      },
      // Ambiente corporativo pode interceptar TLS; permite operação do proxy local.
      ...(isHttps ? { rejectUnauthorized: false } : {})
    }, (resp) => {
      const status = Number(resp.statusCode || 0);
      const location = resp.headers.location;

      if (status >= 300 && status < 400 && location && redirecionamentosRestantes > 0) {
        const proximaUrl = new URL(location, parsed).toString();
        resp.resume();
        baixarArquivoRemoto(proximaUrl, redirecionamentosRestantes - 1).then(resolve).catch(reject);
        return;
      }

      if (status < 200 || status >= 300) {
        resp.resume();
        reject(new Error(`Arquivo remoto indisponível (${status})`));
        return;
      }

      const chunks = [];
      resp.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      resp.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: String(resp.headers['content-type'] || 'application/octet-stream')
        });
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Falha ao baixar arquivo remoto (${error.message})`));
    });

    req.end();
  });
}

async function salvarArquivosDoEnvioNoStorage(envioId, arquivosEntrada) {
  if (!Array.isArray(arquivosEntrada) || arquivosEntrada.length === 0) {
    return [];
  }

  const bucket = await obterStorageObrigatorio();
  const urls = [];

  for (let indice = 0; indice < arquivosEntrada.length; indice += 1) {
    const arquivo = arquivosEntrada[indice];
    if (!arquivo || typeof arquivo !== 'object') {
      continue;
    }

    const nomeOriginal = sanitizarNomeArquivo(arquivo.nome || `anexo-${indice + 1}.pdf`);
    const mimeType = String(arquivo.tipo || 'application/pdf');
    const conteudoBase64 = String(arquivo.conteudoBase64 || '');
    if (!conteudoBase64) {
      continue;
    }

    let base64 = conteudoBase64;
    const dataUrlMatch = conteudoBase64.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataUrlMatch) {
      base64 = dataUrlMatch[2];
    }

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      continue;
    }

    const extensao = path.extname(nomeOriginal) || (mimeType.includes('pdf') ? '.pdf' : '');
    const nomeBase = path.basename(nomeOriginal, extensao || undefined);
    const nomeFinal = `${envioId}-${indice + 1}-${Date.now()}-${nomeBase}${extensao}`;
    const caminhoStorage = `envios/${envioId}/${nomeFinal}`;

    const file = bucket.file(caminhoStorage);
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: mimeType,
        contentDisposition: `attachment; filename="${nomeOriginal}"`,
        cacheControl: 'private, max-age=0, no-transform',
        metadata: {
          envioId: String(envioId),
          nomeOriginal,
          criadoEm: new Date().toISOString()
        }
      }
    });

    const [urlAssinada] = await file.getSignedUrl({
      action: 'read',
      expires: '03-01-2500'
    });

    urls.push(urlAssinada);
  }

  return urls;
}

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

function extrairHostDaUrl(urlStr) {
  try {
    return [new URL(urlStr).host];
  } catch {
    return [];
  }
}

// Conjunto de hosts permitidos para redirecionamento HTTPS (derivado das origens permitidas)
const ALLOWED_HOSTS = new Set([
  'aplicativo-rh-pb-normatel.fly.dev',
  ...(process.env.FRONTEND_URL ? extrairHostDaUrl(process.env.FRONTEND_URL) : []),
]);

// CORS middleware com whitelist
function setCORSHeaders(res, origem, proto) {
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
  if (proto === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  const origem = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/') || 'unknown';
  const ip = obterIpCliente(req);
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();

  // Redirecionar HTTP → HTTPS em produção (valida host contra whitelist)
  if (proto === 'http' && process.env.NODE_ENV === 'production') {
    const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    if (ALLOWED_HOSTS.has(host)) {
      res.writeHead(301, { Location: `https://${host}${req.url}` });
      res.end();
      return;
    }
  }

  setCORSHeaders(res, origem, proto);

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
      res.writeHead(410);
      res.end(JSON.stringify({ error: 'Rota local de uploads desativada. Os anexos agora são servidos via Firebase Storage.' }));
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

      try {
        const arquivosSalvos = await salvarArquivosDoEnvioNoStorage(novoEnvio.id, body.arquivos);
        if (arquivosSalvos.length > 0) {
          novoEnvio.arquivos = arquivosSalvos;
        }
      } catch (storageError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao enviar anexos para Firebase Storage (${storageError.message})` }));
        return;
      }

      try {
        await salvarEnvioNoFirestore(novoEnvio);
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao gravar envio no Firestore (${firestoreError.message})` }));
        return;
      }

      res.writeHead(201);
      res.end(JSON.stringify({
        id: novoEnvio.id,
        success: true,
        arquivos: novoEnvio.arquivos,
        firestore: true
      }));
      return;
    }

    // Listar atestados
    if (pathname === '/api/envios' && req.method === 'GET') {
      const limit = Math.min(parseInt(parsedUrl.query.limit) || 100, 1000);

      try {
        const data = await listarEnviosDoFirestore(limit);
        res.writeHead(200);
        res.end(JSON.stringify(data));
        return;
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao listar envios do Firestore (${firestoreError.message})` }));
        return;
      }
    }

    // Atualizar status de atendimento de um envio (feito/pendente)
    if (pathname.match(/^\/api\/envios\/status\//) && req.method === 'POST') {
      const id = pathname.split('/').pop();

      if (!id || id.length > 100) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'ID inválido' }));
        return;
      }

      let body;
      try {
        body = await parseBody(req);
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      const atendimentoStatus = String(body?.atendimento_status || '').trim().toLowerCase();
      if (!['feito', 'pendente'].includes(atendimentoStatus)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'atendimento_status deve ser "feito" ou "pendente"' }));
        return;
      }

      let atualizado = false;
      try {
        atualizado = await atualizarStatusAtendimentoEnvioFirestore(id, atendimentoStatus);
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao atualizar status do envio (${firestoreError.message})` }));
        return;
      }

      if (!atualizado) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Envio não encontrado' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ id, atendimento_status: atendimentoStatus, atualizado: true }));
      return;
    }

    // Excluir envio
    if (pathname.match(/^\/api\/envios\/excluir\//) && req.method === 'POST') {
      const id = pathname.split('/').pop();

      if (!id || id.length > 100) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'ID inválido' }));
        return;
      }

      let excluido = false;
      try {
        excluido = await excluirEnvioFirestore(id);
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao excluir envio (${firestoreError.message})` }));
        return;
      }

      if (!excluido) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Envio não encontrado' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ id, excluido: true }));
      return;
    }

    // Proxy de download para contornar CORS na geração de ZIP no frontend
    if (pathname === '/api/arquivos/proxy' && req.method === 'GET') {
      const urlArquivo = String(parsedUrl.query.url || '').trim();
      const nomeArquivo = sanitizarNomeArquivo(parsedUrl.query.nome || 'arquivo.pdf');

      if (!urlArquivo) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Parâmetro url é obrigatório' }));
        return;
      }

      if (!urlProxyPermitida(urlArquivo)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'URL não permitida para proxy' }));
        return;
      }

      try {
        const remoto = await baixarArquivoRemoto(urlArquivo);
        res.statusCode = 200;
        res.setHeader('Content-Type', remoto.contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
        res.setHeader('Cache-Control', 'no-store');
        res.end(remoto.buffer);
        return;
      } catch (erroFetch) {
        res.writeHead(502);
        res.end(JSON.stringify({ error: `Falha ao baixar arquivo remoto (${erroFetch.message})` }));
        return;
      }
    }

    // Listar usuários pendentes
    if (pathname === '/api/usuarios/pendentes' && req.method === 'GET') {
      try {
        const data = await listarUsuariosPendentesFirestore();
        res.writeHead(200);
        res.end(JSON.stringify(data));
        return;
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao listar usuários pendentes (${firestoreError.message})` }));
        return;
      }
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

      try {
        await salvarEventoNoFirestore(novoEvento);
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao registrar evento no Firestore (${firestoreError.message})` }));
        return;
      }

      res.writeHead(201);
      res.end(JSON.stringify({ success: true, id: novoEvento.id }));
      return;
    }

    // Listar eventos de uso
    if (pathname === '/api/eventos' && req.method === 'GET') {
      const limit = Math.min(parseInt(parsedUrl.query.limit) || 200, 1000);
      try {
        const data = await listarEventosDoFirestore(limit);
        res.writeHead(200);
        res.end(JSON.stringify(data));
        return;
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao listar eventos do Firestore (${firestoreError.message})` }));
        return;
      }
    }

    // Verificar se usuário existe por e-mail
    if (pathname === '/api/usuarios/existe' && req.method === 'GET') {
      const email = (parsedUrl.query.email || '').toString().trim().toLowerCase();

      if (!email) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Email é obrigatório' }));
        return;
      }

      let usuario;
      try {
        usuario = await obterUsuarioPorEmailFirestore(email);
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao consultar usuário no Firestore (${firestoreError.message})` }));
        return;
      }

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
        let usuarioExistente;
        try {
          usuarioExistente = await obterUsuarioPorEmailFirestore(body.email);
        } catch (firestoreError) {
          res.writeHead(503);
          res.end(JSON.stringify({ error: `Falha ao consultar cadastro no Firestore (${firestoreError.message})` }));
          return;
        }

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

        try {
          await criarUsuarioFirestore(novoUsuario);
        } catch (firestoreError) {
          res.writeHead(503);
          res.end(JSON.stringify({ error: `Falha ao gravar cadastro no Firestore (${firestoreError.message})` }));
          return;
        }

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
      
      let aprovado = false;
      try {
        aprovado = await aprovarUsuarioFirestore(id);
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao aprovar usuário no Firestore (${firestoreError.message})` }));
        return;
      }

      if (aprovado) {
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
      
      let rejeitado = false;
      try {
        rejeitado = await rejeitarUsuarioFirestore(id);
      } catch (firestoreError) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: `Falha ao rejeitar usuário no Firestore (${firestoreError.message})` }));
        return;
      }

      if (rejeitado) {
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
      res.end(JSON.stringify({
        status: 'healthy',
        persistencia: 'firebase-only',
        firebase: {
          firestoreInicializado: !!firestoreDb,
          storageInicializado: !!firebaseStorage,
          storageBucket: firebaseStorageBucket || null
        }
      }));
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
  console.log(`  - GET  /api/arquivos/proxy?url=...&nome=...`);
  console.log(`  - POST /api/envios`);
  console.log(`  - POST /api/envios/status/:id`);
  console.log(`  - POST /api/envios/excluir/:id`);
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
