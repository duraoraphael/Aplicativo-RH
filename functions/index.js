const path = require("path");
const {setGlobalOptions} = require("firebase-functions/v2");
const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {initializeApp, cert, applicationDefault, getApps} =
  require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");

setGlobalOptions({maxInstances: 10, region: "us-central1"});

const FIRESTORE_COLLECTIONS = {
  envios: "envios_atestados",
  usuarios: "usuarios_rh",
  eventos: "eventos_frontend",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

const ALLOWED_ORIGINS = obterOrigensPermitidas();
const ALLOWED_ORIGIN_SUFFIXES = obterSufixosPermitidos();
const MAX_PAYLOAD_SIZE = 30 * 1024 * 1024;
const REQUEST_TRACKER = new Map();
const MAX_EVENT_REQUESTS_PER_MINUTE = 2000;
const MAX_CRITICAL_REQUESTS_PER_MINUTE = 300;

let firestoreDb = null;
let firebaseStorage = null;
let firebaseStorageBucket = "";

function obterOrigensPermitidas() {
  const origensEnv = String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origem) => origem.trim().replace(/\/+$/, ""))
      .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...origensEnv]));
}

function obterSufixosPermitidos() {
  const sufixosPadrao = [".vercel.app"];
  const sufixosEnv = String(process.env.ALLOWED_ORIGIN_SUFFIXES || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .map((item) => (item.startsWith(".") ? item : `.${item}`));

  return Array.from(new Set([...sufixosPadrao, ...sufixosEnv]));
}

function obterServiceAccountFirebase() {
  const valor = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!valor) {
    return null;
  }

  try {
    if (valor.startsWith("{")) {
      return JSON.parse(valor);
    }
    return null;
  } catch (_error) {
    return null;
  }
}

function garantirFirebaseInicializado() {
  if (firestoreDb && firebaseStorage) {
    return;
  }

  const serviceAccount = obterServiceAccountFirebase();
  const bucketConfigurado = String(process.env.FIREBASE_STORAGE_BUCKET || "")
      .trim();
  const projectIdDetectado = serviceAccount?.project_id ||
    String(process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "")
        .trim();
  const bucketPadrao = projectIdDetectado ? `${projectIdDetectado}.appspot.com` : "";
  firebaseStorageBucket = bucketConfigurado || bucketPadrao;

  if (getApps().length === 0) {
    const credencialFirebase = serviceAccount ? cert(serviceAccount) : applicationDefault();
    initializeApp({
      credential: credencialFirebase,
      ...(firebaseStorageBucket ? {storageBucket: firebaseStorageBucket} : {}),
    });
  }

  firestoreDb = getFirestore();
  firebaseStorage = getStorage();
}

async function obterFirestoreObrigatorio() {
  garantirFirebaseInicializado();
  if (!firestoreDb) {
    throw new Error("FIRESTORE_NOT_CONFIGURED");
  }
  return firestoreDb;
}

async function obterStorageObrigatorio() {
  garantirFirebaseInicializado();
  if (!firebaseStorage || !firebaseStorageBucket) {
    throw new Error("FIREBASE_STORAGE_NOT_CONFIGURED");
  }
  return firebaseStorage.bucket(firebaseStorageBucket);
}

function normalizarOrigem(origem) {
  return String(origem || "").trim().replace(/\/+$/, "");
}

function origemEhLocalhost(origem) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origem);
}

function origemEhPermitidaPorSufixo(origem) {
  if (!origem) {
    return false;
  }

  let host = "";
  try {
    host = new URL(origem).hostname.toLowerCase();
  } catch (_error) {
    return false;
  }

  return ALLOWED_ORIGIN_SUFFIXES.some((sufixo) => host.endsWith(sufixo));
}

function setSecurityHeaders(res) {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function setCORSHeaders(res, origem) {
  const origemNormalizada = normalizarOrigem(origem);
  const origemPermitida = ALLOWED_ORIGINS.includes(origemNormalizada) ||
    origemEhLocalhost(origemNormalizada) ||
    origemEhPermitidaPorSufixo(origemNormalizada);

  if (origemPermitida && origemNormalizada && origemNormalizada !== "unknown") {
    res.setHeader("Access-Control-Allow-Origin", origemNormalizada);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");
  return origemPermitida || !origemNormalizada || origemNormalizada === "unknown";
}

function obterIpCliente(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.ip ||
    "unknown";
}

function verificarRateLimit(chave, limitePorMinuto) {
  const agora = Date.now();
  const minutoAtras = agora - 60000;

  if (!REQUEST_TRACKER.has(chave)) {
    REQUEST_TRACKER.set(chave, {count: 1, timestamp: agora});
    return true;
  }

  const registro = REQUEST_TRACKER.get(chave);
  if (registro.timestamp < minutoAtras) {
    REQUEST_TRACKER.set(chave, {count: 1, timestamp: agora});
    return true;
  }

  if (registro.count >= limitePorMinuto) {
    return false;
  }

  registro.count += 1;
  return true;
}

function normalizarTextoCurto(valor, limite = 120) {
  return String(valor || "").trim().slice(0, limite);
}

function validarAtestado(dados) {
  const erros = [];
  if (!dados.nome || !String(dados.nome).trim()) erros.push("Nome é obrigatório");
  if (!dados.funcao || !String(dados.funcao).trim()) erros.push("Função é obrigatória");
  if (!dados.projeto || !String(dados.projeto).trim()) erros.push("Projeto é obrigatório");
  if (!dados.tipo_atestado || !String(dados.tipo_atestado).trim()) {
    erros.push("Tipo de atestado é obrigatório");
  }

  const dataInicio = new Date(dados.data_inicio);
  const dataFim = new Date(dados.data_fim);
  if (Number.isNaN(dataInicio.getTime())) erros.push("Data de início inválida");
  if (Number.isNaN(dataFim.getTime())) erros.push("Data de fim inválida");
  if (!Number.isNaN(dataInicio.getTime()) && !Number.isNaN(dataFim.getTime()) && dataFim < dataInicio) {
    erros.push("Data de fim não pode ser antes de data de início");
  }

  if (typeof dados.dias !== "number" || dados.dias < 1 || dados.dias > 365) {
    erros.push("Dias deve ser entre 1 e 365");
  }

  return erros;
}

async function obterBodyJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.rawBody === "object" && req.rawBody?.length) {
    const texto = req.rawBody.toString("utf8");
    return texto ? JSON.parse(texto) : {};
  }

  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_PAYLOAD_SIZE) {
        reject(new Error("Payload muito grande"));
        return;
      }
      data += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (_error) {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", (error) => reject(error));
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
    if (!arquivo || typeof arquivo !== "object") continue;

    const mimeType = String(arquivo.tipo || "application/pdf");
    const conteudoBase64 = String(arquivo.conteudoBase64 || "");
    if (!conteudoBase64) continue;

    let base64 = conteudoBase64;
    const dataUrlMatch = conteudoBase64.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataUrlMatch) {
      base64 = dataUrlMatch[2];
    }

    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) continue;

    const nomeOriginal = String(arquivo.nome || `anexo-${indice + 1}.pdf`)
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/\s+/g, " ")
        .trim() || "arquivo.pdf";

    const extensao = path.extname(nomeOriginal) || (mimeType.includes("pdf") ? ".pdf" : "");
    const nomeBase = path.basename(nomeOriginal, extensao || undefined);
    const nomeFinal = `${envioId}-${indice + 1}-${Date.now()}-${nomeBase}${extensao}`;
    const caminhoStorage = `envios/${envioId}/${nomeFinal}`;

    const file = bucket.file(caminhoStorage);
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: mimeType,
        cacheControl: "private, max-age=0, no-transform",
      },
    });

    const [urlAssinada] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });
    urls.push(urlAssinada);
  }

  return urls;
}

function extrairPathApi(req) {
  const caminho = req.path || "/";
  if (caminho.startsWith("/api/")) return caminho;
  if (caminho === "/api") return "/api";
  if (caminho === "/") return "/";
  return `/api${caminho.startsWith("/") ? "" : "/"}${caminho}`;
}

async function responderApi(req, res) {
  const origem = req.headers.origin || "unknown";
  const ip = obterIpCliente(req);
  const pathname = extrairPathApi(req);

  setSecurityHeaders(res);
  const origemPermitida = setCORSHeaders(res, origem);
  if (!origemPermitida) {
    res.status(403).json({error: "Origem não permitida por CORS"});
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const ehRotaEvento = pathname === "/api/eventos";
  const chaveRateLimit = ehRotaEvento ? `${ip}:eventos` : `${ip}:geral`;
  const limiteRateLimit = ehRotaEvento ? MAX_EVENT_REQUESTS_PER_MINUTE : MAX_CRITICAL_REQUESTS_PER_MINUTE;
  if (!verificarRateLimit(chaveRateLimit, limiteRateLimit)) {
    res.status(429).json({error: "Muitas requisições. Tente novamente em alguns minutos."});
    return;
  }

  try {
    if ((pathname === "/" || pathname === "/api" || pathname === "/api/health") && req.method === "GET") {
      garantirFirebaseInicializado();
      res.status(200).json({
        status: "healthy",
        service: "rh-functions-api",
        firestoreInicializado: !!firestoreDb,
        storageInicializado: !!firebaseStorage,
      });
      return;
    }

    if (pathname === "/api/envios" && req.method === "POST") {
      const body = await obterBodyJson(req);
      const erros = validarAtestado(body);
      if (erros.length > 0) {
        res.status(400).json({error: "Validação falhou", detalhes: erros});
        return;
      }

      const novoEnvio = {
        id: Date.now().toString(),
        nome: String(body.nome).trim(),
        funcao: String(body.funcao).trim(),
        projeto: String(body.projeto).trim(),
        tipo_atestado: String(body.tipo_atestado),
        data_inicio: body.data_inicio,
        data_fim: body.data_fim,
        dias: body.dias,
        horas_comparecimento: body.horas_comparecimento || "",
        criado_em: new Date().toISOString(),
        criado_por_ip: ip,
        arquivos: [],
      };

      const arquivosSalvos = await salvarArquivosDoEnvioNoStorage(novoEnvio.id, body.arquivos);
      if (arquivosSalvos.length > 0) {
        novoEnvio.arquivos = arquivosSalvos;
      }

      const db = await obterFirestoreObrigatorio();
      await db.collection(FIRESTORE_COLLECTIONS.envios)
          .doc(String(novoEnvio.id))
          .set({...novoEnvio, origem_persistencia: "firebase-functions"}, {merge: true});

      res.status(201).json({id: novoEnvio.id, success: true, arquivos: novoEnvio.arquivos});
      return;
    }

    if (pathname === "/api/envios" && req.method === "GET") {
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.envios)
          .orderBy("criado_em", "desc")
          .limit(limit)
          .get();

      const data = snapshot.docs.map((doc) => ({id: doc.id, ...(doc.data() || {})}));
      res.status(200).json(data);
      return;
    }

    if (pathname === "/api/eventos" && req.method === "POST") {
      const body = await obterBodyJson(req);
      const acao = normalizarTextoCurto(body.acao, 80);
      if (!acao) {
        res.status(400).json({error: "Ação é obrigatória"});
        return;
      }

      const novoEvento = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        acao,
        pagina: normalizarTextoCurto(body.pagina, 120),
        email: normalizarTextoCurto(body.email, 150),
        usuario_id: normalizarTextoCurto(body.usuarioId, 80),
        detalhes: body.detalhes && typeof body.detalhes === "object" ? body.detalhes : {},
        criado_em: new Date().toISOString(),
        criado_por_ip: ip,
        user_agent: normalizarTextoCurto(req.headers["user-agent"] || "", 300),
      };

      const db = await obterFirestoreObrigatorio();
      await db.collection(FIRESTORE_COLLECTIONS.eventos)
          .doc(String(novoEvento.id))
          .set({...novoEvento, origem_persistencia: "firebase-functions"}, {merge: true});

      res.status(201).json({success: true, id: novoEvento.id});
      return;
    }

    if (pathname === "/api/eventos" && req.method === "GET") {
      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.eventos)
          .orderBy("criado_em", "desc")
          .limit(limit)
          .get();

      const data = snapshot.docs.map((doc) => ({id: doc.id, ...(doc.data() || {})}));
      res.status(200).json(data);
      return;
    }

    if (pathname === "/api/usuarios/existe" && req.method === "GET") {
      const email = String(req.query.email || "").trim().toLowerCase();
      if (!email) {
        res.status(400).json({error: "Email é obrigatório"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .where("email", "==", email)
          .limit(1)
          .get();

      if (snapshot.empty) {
        res.status(200).json({existe: false});
        return;
      }

      const doc = snapshot.docs[0];
      const usuario = doc.data() || {};
      res.status(200).json({
        existe: true,
        id: doc.id,
        nome: usuario.nome,
        email: usuario.email,
        aprovado: !!usuario.aprovado,
      });
      return;
    }

    if (pathname === "/api/usuarios/pendentes" && req.method === "GET") {
      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .where("aprovado", "==", false)
          .orderBy("criado_em", "desc")
          .get();

      const data = snapshot.docs.map((doc) => ({id: doc.id, ...(doc.data() || {})}));
      res.status(200).json(data);
      return;
    }

    if (pathname === "/api/usuarios" && req.method === "POST") {
      const body = await obterBodyJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const nome = String(body.nome || "").trim();
      if (!email || !nome) {
        res.status(400).json({erros: ["Email e nome são obrigatórios"]});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .where("email", "==", email)
          .limit(1)
          .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const usuario = doc.data() || {};
        const status = usuario.aprovado ? "aprovado" : "pendente";
        res.status(usuario.aprovado ? 200 : 202)
            .json({id: doc.id, status, mensagem: "Usuário já cadastrado"});
        return;
      }

      const novoUsuario = {
        id: Date.now().toString(),
        email,
        nome,
        departamento: body.departamento || "",
        cargo: body.cargo || "",
        aprovado: false,
        criado_em: new Date().toISOString(),
        criado_por_ip: ip,
      };

      await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .doc(String(novoUsuario.id))
          .set(novoUsuario, {merge: false});

      res.status(202).json({id: novoUsuario.id, status: "pendente"});
      return;
    }

    if (/^\/api\/usuarios\/aprovar\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 50) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.usuarios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Usuário não encontrado"});
        return;
      }

      await ref.set({aprovado: true, atualizado_em: new Date().toISOString()}, {merge: true});
      res.status(200).json({id, aprovado: true, mensagem: "Usuário aprovado"});
      return;
    }

    if (/^\/api\/usuarios\/rejeitar\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 50) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.usuarios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Usuário não encontrado"});
        return;
      }

      await ref.delete();
      res.status(200).json({id, rejeitado: true, mensagem: "Usuário removido"});
      return;
    }

    if (/^\/api\/envios\/status\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 100) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const body = await obterBodyJson(req);
      const atendimentoStatus = String(body?.atendimento_status || "").trim().toLowerCase();
      if (!["feito", "pendente"].includes(atendimentoStatus)) {
        res.status(400).json({error: "atendimento_status deve ser \"feito\" ou \"pendente\""});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.envios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Envio não encontrado"});
        return;
      }

      await ref.set({
        atendimento_status: atendimentoStatus,
        atendimento_atualizado_em: new Date().toISOString(),
      }, {merge: true});

      res.status(200).json({id, atendimento_status: atendimentoStatus, atualizado: true});
      return;
    }

    if (/^\/api\/envios\/excluir\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 100) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.envios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Envio não encontrado"});
        return;
      }

      await ref.set({excluido: true, excluido_em: new Date().toISOString()}, {merge: true});
      res.status(200).json({id, excluido: true});
      return;
    }

    if (/^\/api\/envios\/restaurar\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 100) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.envios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Envio não encontrado"});
        return;
      }

      await ref.update({excluido: false, excluido_em: null});
      res.status(200).json({id, restaurado: true});
      return;
    }

    res.status(404).json({error: "Rota não encontrada"});
  } catch (error) {
    logger.error("Erro na API", error);
    res.status(500).json({error: "Erro interno do servidor", detalhe: error.message});
  }
}

exports.api = onRequest({memory: "1GiB", timeoutSeconds: 120}, responderApi);

exports.apiHealth = onRequest((request, response) => {
  logger.info("RH API online", {structuredData: true});
  response.status(200).json({status: "healthy", service: "functions"});
});
