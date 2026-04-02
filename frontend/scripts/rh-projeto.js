//const BACKEND_URL = '';

const projetoTitulo = document.getElementById('projetoTitulo');
const projetoDescricao = document.getElementById('projetoDescricao');
const detalhesStatus = document.getElementById('detalhesStatus');
const detalhesContainer = document.getElementById('detalhesContainer');
const filtroNomeInput = document.getElementById('filtroNome');
const filtroDataInicioInput = document.getElementById('filtroDataInicio');
const filtroDataFimInput = document.getElementById('filtroDataFim');
const filtroTipoSelect = document.getElementById('filtroTipoAtestado');
const filtroPendentesBtn = document.getElementById('filtroPendentesBtn');
const filtroFeitosBtn = document.getElementById('filtroFeitosBtn');
const filtroExcluidosBtn = document.getElementById('filtroExcluidosBtn');
const baixarFiltradosBtn = document.getElementById('baixarFiltradosBtn');
const voltarPainelRhProjetoBtn = document.getElementById('voltarPainelRhProjetoBtn');
const DEFAULT_REMOTE_BACKEND_URL = 'https://api-vgqcbmomea-uc.a.run.app';

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

  if (window.__RH_BACKEND_URL__) {
    return String(window.__RH_BACKEND_URL__).trim().replace(/\/+$/, '');
  }

  return DEFAULT_REMOTE_BACKEND_URL;
}

const BACKEND_URL = resolverBackendUrl();

const BASES_PROJETO = {
  '736': 'Base Imbetiba',
  '737': 'Base Imboassica',
  '743': 'Bases: Cabiunas, Severina e Barra do Furado',
  '741': 'Bases: UTE, Áreas Externa e Tapera',
  '744': 'Apoio Macaé',
  'Apoio Macae': 'Base de apoio'
};

const TITULOS_PROJETO = {
  '744': 'Apoio Macaé'
};

let registrosProjeto = [];
let registrosProjetoFiltrados = [];
let downloadMassaEmAndamento = false;
const atendimentosEmAtualizacao = new Set();
let excluindoAtestado = false;
let restaurandoAtestado = false;
let detalhesStatusTimer = null;
let codigoProjetoAtual = '';
let todosRegistros = [];
const RH_PROJETO_CODIGO_KEY = 'rh_projeto_codigo';
const RH_PROJETO_ORIGEM_KEY = 'rh_projeto_origem';
let cancelMonitorAcessoRh = null;
let filtroAtendimentoAtual = 'pendente';
let cacheBackendsZipDisponiveis = [];
let cacheBackendsZipAtualizadoEm = 0;

async function requisicaoBackendJson(url, options = {}, tentativas = 2) {
  let ultimaResposta = null;

  for (let i = 0; i <= tentativas; i += 1) {
    let resposta;
    try {
      resposta = await fetch(url, options);
    } catch {
      if (i === tentativas) {
        throw new Error('BACKEND_UNREACHABLE');
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
      continue;
    }

    ultimaResposta = resposta;

    if (resposta.ok) {
      return await resposta.json();
    }

    const statusRepetivel = resposta.status === 429 || resposta.status >= 500;
    if (!statusRepetivel || i === tentativas) {
      let detalhe = '';
      try {
        const body = await resposta.json();
        detalhe = body?.error || body?.mensagem || '';
      } catch {
        detalhe = await resposta.text().catch(() => '');
      }
      throw new Error(`${resposta.status}${detalhe ? ` - ${detalhe}` : ''}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
  }

  throw new Error(`${ultimaResposta?.status || 'BACKEND_ERROR'}`);
}

function erroPermissaoFirestore(error) {
  const texto = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return texto.includes('permission-denied') || texto.includes('missing or insufficient permissions');
}

function resolverBackendPreferencial() {
  const candidatos = listarBackendsCandidatos();
  return candidatos[0] || '';
}

function listarBackendsCandidatos() {
  const urls = [];

  if (BACKEND_URL) {
    urls.push(BACKEND_URL);
  }

  if (typeof window !== 'undefined') {
    const origin = String(window.location.origin || '').trim().replace(/\/+$/, '');

    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      urls.push(origin);
    }
  }

  return [...new Set(urls.filter(Boolean))];
}

function forcarLogoutPorRevogacaoAcesso() {
  localStorage.removeItem('rh_auth_token');
  localStorage.removeItem('rh_user_id');
  localStorage.removeItem('rh_user_email');
  localStorage.removeItem('rh_user_nome');
  localStorage.removeItem('rh_user_pendente');
  window.location.href = 'rh-login.html';
}

function iniciarMonitoramentoAcessoRh() {
  const email = String(localStorage.getItem('rh_user_email') || '').trim().toLowerCase();
  if (!email || typeof window?.firebase?.firestore !== 'function') {
    return;
  }

  try {
    cancelMonitorAcessoRh = window.firebase.firestore()
      .collection('usuarios_rh')
      .where('email', '==', email)
      .limit(1)
      .onSnapshot((snapshot) => {
        if (!snapshot || snapshot.empty) {
          forcarLogoutPorRevogacaoAcesso();
          return;
        }

        const usuario = snapshot.docs[0].data() || {};
        const status = String(usuario.status || '').toLowerCase();
        const aprovado = usuario.aprovado === true || status === 'aprovado';
        if (!aprovado) {
          forcarLogoutPorRevogacaoAcesso();
        }
      }, () => { /* erro de transporte — SDK reconecta automaticamente */ });
  } catch {
    // Sem monitoramento em caso de falha de permissão/rede.
  }
}

async function carregarEnviosComFallback() {
  try {
    const snapshot = await window.firebase.firestore().collection('envios_atestados').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    if (!erroPermissaoFirestore(error)) {
      throw error;
    }

    const backends = listarBackendsCandidatos();
    if (!backends.length) {
      throw new Error('Sem permissão no Firestore para ler envios_atestados. Publique regras no Firebase Console liberando leitura desta coleção para o painel RH.');
    }

    for (const backendBase of backends) {
      try {
        const dados = await requisicaoBackendJson(`${backendBase}/api/envios?limit=1000`);
        return Array.isArray(dados) ? dados : [];
      } catch {
        // tenta próximo backend candidato
      }
    }

    throw new Error(`Backends indisponíveis (${backends.join(', ')}) e Firestore sem permissão para envios_atestados.`);
  }
}

function setDetalhesStatus(texto, tipo = 'info') {
  if (!detalhesStatus) {
    const metodo = tipo === 'error' ? 'error' : (tipo === 'success' ? 'log' : 'info');
    console[metodo](`[rh-projeto] ${texto}`);
    return;
  }

  if (detalhesStatusTimer) {
    clearTimeout(detalhesStatusTimer);
    detalhesStatusTimer = null;
  }

  detalhesStatus.textContent = texto;
  detalhesStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    detalhesStatus.classList.add('status-message--error');
  } else if (tipo === 'success') {
    detalhesStatus.classList.add('status-message--success');
  } else {
    detalhesStatus.classList.add('status-message--info');
  }

  if (tipo === 'success' || tipo === 'info') {
    detalhesStatusTimer = setTimeout(() => {
      if (!detalhesStatus) return;
      detalhesStatus.textContent = '';
      detalhesStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
      detalhesStatusTimer = null;
    }, 4000);
  }
}

function formatarData(valorData) {
  if (!valorData || typeof valorData !== 'string') return '-';
  const partes = valorData.split('-');
  if (partes.length !== 3) return valorData;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatarDataHora(valorDataHora) {
  if (!valorDataHora || typeof valorDataHora !== 'string') return '-';
  const data = new Date(valorDataHora);
  if (Number.isNaN(data.getTime())) return valorDataHora;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(data);
}

function normalizarTexto(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function obterTituloProjeto(codigoProjeto) {
  const tituloEspecial = String(TITULOS_PROJETO[codigoProjeto] || '').trim();
  if (tituloEspecial) {
    return tituloEspecial;
  }

  return /^\d+$/.test(codigoProjeto) ? `Projeto ${codigoProjeto}` : codigoProjeto;
}

function obterTermosProjeto(codigoProjeto) {
  const termos = [String(codigoProjeto || '').trim()];

  if (String(codigoProjeto || '').trim() === '744') {
    termos.push('Apoio Macaé', 'Apoio Macae', 'Base de apoio');
  }

  return [...new Set(termos.filter(Boolean))];
}

function correspondeProjeto(registroProjeto, codigoProjeto) {
  const valorRaw = String(registroProjeto || '').trim();
  if (!valorRaw) {
    return false;
  }

  const valorNormalizado = normalizarTexto(valorRaw);
  const termos = obterTermosProjeto(codigoProjeto);

  return termos.some((termo) => {
    const termoRaw = String(termo || '').trim();
    if (!termoRaw) {
      return false;
    }

    if (/^\d+$/.test(termoRaw)) {
      const padrao = new RegExp(`\\b${termoRaw}\\b`);
      return padrao.test(valorRaw);
    }

    return valorNormalizado.includes(normalizarTexto(termoRaw));
  });
}

function obterEstadoFiltrosDaUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    nome: String(params.get('nome') || '').trim(),
    inicio: String(params.get('inicio') || '').trim(),
    fim: String(params.get('fim') || '').trim(),
    tipo: String(params.get('tipo') || '').trim(),
    atendimento: String(params.get('atendimento') || '').trim().toLowerCase()
  };
}

function atualizarUrlEstadoDetalhes() {
  const params = new URLSearchParams(window.location.search);

  params.delete('projeto');
  params.delete('origem');

  const nome = String(filtroNomeInput?.value || '').trim();
  const inicio = String(filtroDataInicioInput?.value || '').trim();
  const fim = String(filtroDataFimInput?.value || '').trim();
  const tipo = String(filtroTipoSelect?.value || '').trim();

  if (nome) {
    params.set('nome', nome);
  } else {
    params.delete('nome');
  }

  if (inicio) {
    params.set('inicio', inicio);
  } else {
    params.delete('inicio');
  }

  if (fim) {
    params.set('fim', fim);
  } else {
    params.delete('fim');
  }

  if (tipo) {
    params.set('tipo', tipo);
  } else {
    params.delete('tipo');
  }

  if (filtroAtendimentoAtual === 'feito' || filtroAtendimentoAtual === 'pendente' || filtroAtendimentoAtual === 'excluido') {
    params.set('atendimento', filtroAtendimentoAtual);
  } else {
    params.delete('atendimento');
  }

  const novaUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', novaUrl);
}

function restaurarEstadoFiltrosDaUrl() {
  const estado = obterEstadoFiltrosDaUrl();

  if (filtroNomeInput && estado.nome) {
    filtroNomeInput.value = estado.nome;
  }
  if (filtroDataInicioInput && estado.inicio) {
    filtroDataInicioInput.value = estado.inicio;
  }
  if (filtroDataFimInput && estado.fim) {
    filtroDataFimInput.value = estado.fim;
  }

  if (filtroTipoSelect && estado.tipo) {
    const optionExiste = Array.from(filtroTipoSelect.options).some((opt) => opt.value === estado.tipo);
    if (optionExiste) {
      filtroTipoSelect.value = estado.tipo;
    }
  }

  if (estado.atendimento === 'feito' || estado.atendimento === 'pendente' || estado.atendimento === 'excluido') {
    filtroAtendimentoAtual = estado.atendimento;
  }

  atualizarBotoesFiltroAtendimento();
}

function atualizarBotoesFiltroAtendimento() {
  if (filtroPendentesBtn) {
    const ativo = filtroAtendimentoAtual === 'pendente';
    filtroPendentesBtn.classList.toggle('is-active', ativo);
    filtroPendentesBtn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  }

  if (filtroFeitosBtn) {
    const ativo = filtroAtendimentoAtual === 'feito';
    filtroFeitosBtn.classList.toggle('is-active', ativo);
    filtroFeitosBtn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  }

  if (filtroExcluidosBtn) {
    const ativo = filtroAtendimentoAtual === 'excluido';
    filtroExcluidosBtn.classList.toggle('is-active', ativo);
    filtroExcluidosBtn.classList.toggle('is-active--lixeira', ativo);
    filtroExcluidosBtn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    const totalExcluidos = registrosProjeto.filter((r) => r?.excluido === true).length;
    filtroExcluidosBtn.textContent = totalExcluidos > 0 ? `🗑️ Excluídos (${totalExcluidos})` : '🗑️ Excluídos';
  }
}

function definirFiltroAtendimento(status) {
  const normalizado = status === 'feito' ? 'feito' : (status === 'excluido' ? 'excluido' : 'pendente');
  if (filtroAtendimentoAtual === normalizado) {
    return;
  }

  filtroAtendimentoAtual = normalizado;
  atualizarBotoesFiltroAtendimento();
  aplicarFiltros();
}

function configurarLinkVoltar() {
  if (!voltarPainelRhProjetoBtn) return;

  const params = new URLSearchParams(window.location.search);
  const origemSessao = String(sessionStorage.getItem(RH_PROJETO_ORIGEM_KEY) || '').trim();
  const origem = String(origemSessao || params.get('origem') || 'rh-atestados.html').trim();
  const origemSegura = /^[a-z0-9\-_.]+\.html$/i.test(origem) ? origem : 'rh-atestados.html';
  voltarPainelRhProjetoBtn.href = origemSegura;
}

function obterCodigoProjetoSelecionado() {
  const params = new URLSearchParams(window.location.search);
  const codigoSessao = String(sessionStorage.getItem(RH_PROJETO_CODIGO_KEY) || '').trim();
  const codigoUrl = String(params.get('projeto') || '').trim();
  const codigo = codigoSessao || codigoUrl;

  if (codigo) {
    sessionStorage.setItem(RH_PROJETO_CODIGO_KEY, codigo);
  }

  return codigo;
}

function obterDataISO(valorDataHora) {
  if (!valorDataHora || typeof valorDataHora !== 'string') return '';
  const data = new Date(valorDataHora);
  if (Number.isNaN(data.getTime())) return '';
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function formatarDataCurtaParaNome(dataISO) {
  if (!dataISO || typeof dataISO !== 'string') return '00.00.00';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia || '00'}.${mes || '00'}.${(ano || '').slice(-2) || '00'}`;
}

function normalizarNomePessoaParaArquivo(nomePessoa) {
  return String(nomePessoa || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function montarNomePdfPorRegistro(record, indice = 0, totalArquivos = 1) {
  const nomePessoa = normalizarNomePessoaParaArquivo(record?.nome);
  const dataInicioCurta = formatarDataCurtaParaNome(record?.data_inicio);
  const tipo = String(record?.tipo_atestado || '');

  let base;
  if (tipo === 'Declaração') {
    base = `DECLARAÇÃO MÉDICA - ${dataInicioCurta} - ${nomePessoa}`;
  } else {
    const totalDias = Number(record?.dias) || 0;
    const labelDias = totalDias === 1 ? 'DIA' : 'DIAS';
    base = `ATESTADO MÉDICO - ${dataInicioCurta} (${totalDias} ${labelDias}) - ${nomePessoa}`;
  }

  if (totalArquivos > 1) {
    return `${base} - ANEXO ${indice + 1}.pdf`;
  }

  return `${base}.pdf`;
}

function obterNomeArquivoEnviado(arquivo, record, indice, totalArquivos) {
  const nomeArquivoSalvo = typeof arquivo?.nome === 'string' ? arquivo.nome.trim() : '';
  if (nomeArquivoSalvo) {
    return nomeArquivoSalvo;
  }

  return montarNomePdfPorRegistro(record, indice, totalArquivos);
}

function validarUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizarNomeArquivoDownload(nome) {
  const base = String(nome || 'arquivo.pdf').trim() || 'arquivo.pdf';
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/["\\\r\n]/g, '_');
}

function montarUrlForcarDownload(urlArquivo, nomeDownload) {
  try {
    const parsed = new URL(urlArquivo);
    const nomeSeguro = sanitizarNomeArquivoDownload(nomeDownload);
    parsed.searchParams.set('response-content-disposition', `attachment; filename="${nomeSeguro}"`);
    parsed.searchParams.set('response-content-type', 'application/octet-stream');
    return parsed.toString();
  } catch {
    return urlArquivo;
  }
}

async function garantirMetadataDownload(urlArquivo, nomeDownload) {
  if (!window.storage || typeof window.storage.refFromURL !== 'function') {
    return urlArquivo;
  }

  try {
    const ref = window.storage.refFromURL(urlArquivo);
    const nomeSeguro = sanitizarNomeArquivoDownload(nomeDownload);
    await ref.updateMetadata({
      contentDisposition: `attachment; filename="${nomeSeguro}"`,
      contentType: 'application/pdf'
    });
    return await ref.getDownloadURL();
  } catch {
    return urlArquivo;
  }
}

function criarDetalheItem(label, valor) {
  return `<div class="detalhe-item"><span>${label}</span><strong>${valor || '-'}</strong></div>`;
}

function obterStatusAtendimento(record) {
  return String(record?.atendimento_status || '').trim().toLowerCase() === 'feito' ? 'feito' : 'pendente';
}

function rotuloStatusAtendimento(status) {
  return status === 'feito' ? 'Feito' : 'Pendente';
}

function classeStatusAtendimento(status) {
  return status === 'feito' ? 'detalhe-status--feito' : 'detalhe-status--pendente';
}

function lerStatusAtendimentoLegado() {
  try {
    const bruto = localStorage.getItem('rh_atendimento_status_local') || '{}';
    const parsed = JSON.parse(bruto);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function migrarStatusAtendimentoLegado(registros) {
  const mapaLegado = lerStatusAtendimentoLegado();
  const entradas = Object.entries(mapaLegado || {});
  if (!entradas.length) {
    return { migrados: 0, pendentes: 0 };
  }

  const porId = new Map((registros || []).map((registro) => [String(registro?.id || ''), registro]));
  const mapaPendente = {};
  let migrados = 0;

  for (const [idBruto, statusBruto] of entradas) {
    const id = String(idBruto || '').trim();
    if (!id || !porId.has(id)) {
      continue;
    }

    const statusDestino = String(statusBruto || '').trim().toLowerCase() === 'feito' ? 'feito' : 'pendente';
    const registro = porId.get(id);
    const statusAtual = obterStatusAtendimento(registro);

    if (statusAtual === statusDestino) {
      migrados += 1;
      continue;
    }

    try {
      try {
        await atualizarStatusAtendimentoNoBackend(id, statusDestino);
      } catch {
        await atualizarStatusAtendimentoNoFirestore(id, statusDestino);
      }

      registro.atendimento_status = statusDestino;
      registro.atendimento_atualizado_em = new Date().toISOString();
      migrados += 1;
    } catch {
      mapaPendente[id] = statusDestino;
    }
  }

  if (Object.keys(mapaPendente).length) {
    try {
      localStorage.setItem('rh_atendimento_status_local', JSON.stringify(mapaPendente));
    } catch {
      // Mantem fluxo mesmo com bloqueio de storage.
    }
  } else {
    try {
      localStorage.removeItem('rh_atendimento_status_local');
    } catch {
      // Mantem fluxo mesmo com bloqueio de storage.
    }
  }

  return { migrados, pendentes: Object.keys(mapaPendente).length };
}

function criarCardRegistro(record) {
  const card = document.createElement('article');
  const isExcluido = record?.excluido === true;
  const statusAtendimento = obterStatusAtendimento(record);
  const classesCard = ['detalhe-card'];
  if (isExcluido) {
    classesCard.push('detalhe-card--excluido');
  } else if (statusAtendimento === 'feito') {
    classesCard.push('detalhe-card--feito');
  }
  card.className = classesCard.join(' ');
  card.dataset.registroId = String(record?.id || '');

  const arquivos = Array.isArray(record.arquivos)
    ? record.arquivos.map((arquivo) => (typeof arquivo === 'string' ? { url: arquivo } : arquivo))
    : (typeof record.arquivos === 'string' && record.arquivos ? [{ url: record.arquivos }] : []);

  const arquivosHtml = arquivos.length
    ? arquivos
      .filter((arquivo) => validarUrl(arquivo?.url || arquivo))
      .map((arquivo, indice) => {
        const urlArquivo = arquivo?.url || arquivo;
        const nomeExibicao = obterNomeArquivoEnviado(arquivo, record, indice, arquivos.length);
        const urlDownload = montarUrlForcarDownload(urlArquivo, nomeExibicao);
        return `<a class="download-pdf-link" href="${urlDownload}" download="${nomeExibicao}" data-download-name="${encodeURIComponent(nomeExibicao)}" data-raw-url="${encodeURIComponent(urlArquivo)}"><span class="download-file-name">${nomeExibicao}</span><span class="download-file-action">Baixar</span></a>`;
      })
      .join('<br>')
    : '-';

  const statusHtml = isExcluido
    ? `<span class="detalhe-status detalhe-status--excluido">Excluído</span>`
    : `<span class="detalhe-status ${classeStatusAtendimento(statusAtendimento)}">${rotuloStatusAtendimento(statusAtendimento)}</span>`;

  const botoesHtml = isExcluido
    ? `<button type="button" class="detalhe-restaurar-btn" data-action="restore-registro">↩️ Restaurar</button>`
    : `<button type="button" class="detalhe-marcar-btn" data-action="toggle-feito">${statusAtendimento === 'feito' ? 'Desmarcar' : 'Marcar como feito'}</button>
        <button type="button" class="detalhe-excluir-btn detalhe-excluir-btn--icon" data-action="delete-registro" aria-label="Excluir atestado" title="Excluir atestado"><span aria-hidden="true">&#128465;</span></button>`;

  card.innerHTML = `
    <h3>${record.nome || 'Sem nome informado'}</h3>
    <div class="detalhe-top-actions">
      ${statusHtml}
      <div class="detalhe-top-actions-buttons">
        ${botoesHtml}
      </div>
    </div>
    <div class="detalhe-grid">
      ${criarDetalheItem('Função', record.funcao)}
      ${criarDetalheItem('Projeto', record.projeto)}
      ${criarDetalheItem('Tipo', record.tipo_atestado)}
      ${criarDetalheItem('Horas', record.horas_comparecimento || '-')}
      ${criarDetalheItem('Data início', formatarData(record.data_inicio))}
      ${criarDetalheItem('Data fim', formatarData(record.data_fim))}
      ${criarDetalheItem('Dias', record.dias)}
      ${criarDetalheItem('Enviado em', formatarDataHora(record.criado_em))}
      ${isExcluido ? criarDetalheItem('Excluído em', formatarDataHora(record.excluido_em)) : ''}
    </div>
    <div class="detalhe-arquivos">
      <span>Arquivo(s)</span>
      <div>${arquivosHtml}</div>
    </div>
  `;

  return card;
}

function atualizarStatusLocalRegistro(registroId, atendimentoStatus) {
  const normalizado = String(atendimentoStatus || '').trim().toLowerCase() === 'feito' ? 'feito' : 'pendente';

  const atualizarLista = (lista) => {
    const idx = lista.findIndex((item) => String(item?.id || '') === String(registroId || ''));
    if (idx >= 0) {
      lista[idx].atendimento_status = normalizado;
      lista[idx].atendimento_atualizado_em = new Date().toISOString();
    }
  };

  atualizarLista(todosRegistros);
  atualizarLista(registrosProjeto);
  atualizarLista(registrosProjetoFiltrados);
}

function obterRegistroPorId(registroId) {
  const id = String(registroId || '');
  return todosRegistros.find((item) => String(item?.id || '') === id)
    || registrosProjeto.find((item) => String(item?.id || '') === id)
    || registrosProjetoFiltrados.find((item) => String(item?.id || '') === id)
    || null;
}

function removerRegistroLocal(registroId) {
  const id = String(registroId || '');
  todosRegistros = todosRegistros.filter((item) => String(item?.id || '') !== id);
  registrosProjeto = registrosProjeto.filter((item) => String(item?.id || '') !== id);
  registrosProjetoFiltrados = registrosProjetoFiltrados.filter((item) => String(item?.id || '') !== id);
}

function marcarRegistroComoExcluidoLocal(registroId) {
  const id = String(registroId || '');
  const atualizar = (lista) => {
    const idx = lista.findIndex((item) => String(item?.id || '') === id);
    if (idx >= 0) {
      lista[idx].excluido = true;
      lista[idx].excluido_em = new Date().toISOString();
    }
  };
  atualizar(todosRegistros);
  atualizar(registrosProjeto);
  registrosProjetoFiltrados = registrosProjetoFiltrados.filter((item) => String(item?.id || '') !== id);
}

function marcarRegistroComoRestauradoLocal(registroId) {
  const id = String(registroId || '');
  const atualizar = (lista) => {
    const idx = lista.findIndex((item) => String(item?.id || '') === id);
    if (idx >= 0) {
      lista[idx].excluido = false;
      lista[idx].excluido_em = null;
    }
  };
  atualizar(todosRegistros);
  atualizar(registrosProjeto);
  registrosProjetoFiltrados = registrosProjetoFiltrados.filter((item) => String(item?.id || '') !== id);
}

async function excluirRegistroNoBackend(registroId) {
  const candidatos = listarBackendsCandidatos();
  if (!candidatos.length) {
    throw new Error('BACKEND_NOT_AVAILABLE');
  }

  for (const backendBase of candidatos) {
    try {
      await requisicaoBackendJson(`${backendBase}/api/envios/excluir/${encodeURIComponent(registroId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return;
    } catch (erro) {
      const msg = String(erro?.message || '');
      if (msg.startsWith('404')) {
        throw new Error('BACKEND_DELETE_ROUTE_NOT_FOUND');
      }
      // tenta proximo backend candidato
    }
  }

  throw new Error('BACKEND_DELETE_FAILED');
}

async function excluirRegistroNoFirestore(registroId) {
  await window.firebase.firestore().collection('envios_atestados').doc(String(registroId)).set({
    excluido: true,
    excluido_em: new Date().toISOString()
  }, { merge: true });
}

async function restaurarRegistroNoBackend(registroId) {
  const candidatos = listarBackendsCandidatos();
  if (!candidatos.length) {
    throw new Error('BACKEND_NOT_AVAILABLE');
  }

  for (const backendBase of candidatos) {
    try {
      await requisicaoBackendJson(`${backendBase}/api/envios/restaurar/${encodeURIComponent(registroId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return;
    } catch (erro) {
      const msg = String(erro?.message || '');
      if (msg.startsWith('404')) {
        throw new Error('BACKEND_RESTORE_ROUTE_NOT_FOUND');
      }
    }
  }

  throw new Error('BACKEND_RESTORE_FAILED');
}

async function restaurarRegistroNoFirestore(registroId) {
  await window.firebase.firestore().collection('envios_atestados').doc(String(registroId)).update({
    excluido: false,
    excluido_em: null
  });
}

async function restaurarAtestado(registroId) {
  if (!registroId || restaurandoAtestado) return;

  restaurandoAtestado = true;

  // Atualização otimista: UI responde imediatamente.
  marcarRegistroComoRestauradoLocal(registroId);
  atualizarBotoesFiltroAtendimento();
  aplicarFiltros();
  setDetalhesStatus('Atestado restaurado com sucesso.', 'success');

  try {
    try {
      await restaurarRegistroNoBackend(registroId);
    } catch {
      await restaurarRegistroNoFirestore(registroId);
    }
  } catch (error) {
    // Rollback em caso de falha na persistência.
    marcarRegistroComoExcluidoLocal(registroId);
    atualizarBotoesFiltroAtendimento();
    aplicarFiltros();
    setDetalhesStatus(`Não foi possível restaurar o atestado: ${error?.message || 'falha desconhecida'}`, 'error');
  } finally {
    restaurandoAtestado = false;
  }
}

function abrirModalConfirmacaoExclusao() {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalExclusao');
    const btnConfirmar = document.getElementById('modalExclusaoConfirmar');
    const btnCancelar = document.getElementById('modalExclusaoCancelar');

    if (!modal || !btnConfirmar || !btnCancelar) {
      resolve(window.confirm('Confirma a exclusão deste atestado? Esta ação não pode ser desfeita.'));
      return;
    }

    document.body.classList.add('dialog-open');
    modal.hidden = false;
    btnConfirmar.focus();

    function fechar(resultado) {
      modal.hidden = true;
      document.body.classList.remove('dialog-open');
      btnConfirmar.removeEventListener('click', onConfirmar);
      btnCancelar.removeEventListener('click', onCancelar);
      modal.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onEsc);
      resolve(resultado);
    }

    function onConfirmar() { fechar(true); }
    function onCancelar() { fechar(false); }
    function onOverlayClick(e) { if (e.target === modal) fechar(false); }
    function onEsc(e) { if (e.key === 'Escape') fechar(false); }

    btnConfirmar.addEventListener('click', onConfirmar);
    btnCancelar.addEventListener('click', onCancelar);
    modal.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onEsc);
  });
}

async function excluirAtestado(registroId) {
  if (!registroId) {
    setDetalhesStatus('Não foi possível excluir: registro sem identificação.', 'error');
    return;
  }

  if (excluindoAtestado) {
    return;
  }

  const confirmar = await abrirModalConfirmacaoExclusao();
  if (!confirmar) {
    return;
  }

  excluindoAtestado = true;

  // Atualização otimista: UI responde imediatamente.
  marcarRegistroComoExcluidoLocal(registroId);
  atualizarBotoesFiltroAtendimento();
  aplicarFiltros();
  setDetalhesStatus('Atestado movido para Excluídos. Acesse a aba para restaurar.', 'success');

  try {
    try {
      await excluirRegistroNoBackend(registroId);
    } catch {
      await excluirRegistroNoFirestore(registroId);
    }
  } catch (error) {
    // Rollback em caso de falha na persistência.
    marcarRegistroComoRestauradoLocal(registroId);
    atualizarBotoesFiltroAtendimento();
    aplicarFiltros();
    setDetalhesStatus(`Não foi possível excluir o atestado: ${error?.message || 'falha desconhecida'}`, 'error');
  } finally {
    excluindoAtestado = false;
  }
}

async function atualizarStatusAtendimentoNoBackend(registroId, atendimentoStatus) {
  const candidatos = listarBackendsCandidatos();
  if (!candidatos.length) {
    throw new Error('BACKEND_NOT_AVAILABLE');
  }

  for (const backendBase of candidatos) {
    try {
      await requisicaoBackendJson(`${backendBase}/api/envios/status/${encodeURIComponent(registroId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atendimento_status: atendimentoStatus })
      });
      return;
    } catch (erro) {
      const msg = String(erro?.message || '');
      if (msg.startsWith('404')) {
        throw new Error('BACKEND_STATUS_ROUTE_NOT_FOUND');
      }
      // tenta próximo backend
    }
  }

  throw new Error('BACKEND_STATUS_UPDATE_FAILED');
}

async function atualizarStatusAtendimentoNoFirestore(registroId, atendimentoStatus) {
  await window.firebase.firestore().collection('envios_atestados').doc(String(registroId)).set({
    atendimento_status: atendimentoStatus,
    atendimento_atualizado_em: new Date().toISOString()
  }, { merge: true });
}

async function marcarRegistroComoFeito(registroId, atendimentoStatus) {
  if (!registroId) {
    setDetalhesStatus('Não foi possível atualizar: registro sem identificação.', 'error');
    return;
  }

  const id = String(registroId || '');
  if (atendimentosEmAtualizacao.has(id)) {
    return;
  }

  atendimentosEmAtualizacao.add(id);
  const statusDestino = atendimentoStatus === 'feito' ? 'feito' : 'pendente';
  const registroAlvo = obterRegistroPorId(id);
  const statusAnterior = registroAlvo ? obterStatusAtendimento(registroAlvo) : 'pendente';

  // Atualização otimista: a UI responde imediatamente e sincroniza em segundo plano.
  if (statusAnterior !== statusDestino) {
    atualizarStatusLocalRegistro(id, statusDestino);
    aplicarFiltros();
  }

  try {
    try {
      await atualizarStatusAtendimentoNoBackend(id, statusDestino);
    } catch {
      await atualizarStatusAtendimentoNoFirestore(id, statusDestino);
    }

    setDetalhesStatus(statusDestino === 'feito' ? 'Atestado marcado como feito.' : 'Atestado marcado como pendente.', 'success');
  } catch (error) {
    // Rollback do estado em caso de falha na persistência.
    if (statusAnterior !== statusDestino) {
      atualizarStatusLocalRegistro(id, statusAnterior);
      aplicarFiltros();
    }

    setDetalhesStatus(`Não foi possível atualizar o status: ${error?.message || 'falha desconhecida'}`, 'error');
  } finally {
    atendimentosEmAtualizacao.delete(id);
  }
}

function ativarAcoesAtendimentoNosCards() {
  if (!detalhesContainer) return;

  detalhesContainer.addEventListener('click', async (event) => {
    const botaoExcluir = event.target.closest('button.detalhe-excluir-btn[data-action="delete-registro"]');
    if (botaoExcluir) {
      event.preventDefault();
      const card = botaoExcluir.closest('.detalhe-card');
      const registroId = String(card?.dataset?.registroId || '').trim();
      await excluirAtestado(registroId);
      return;
    }

    const botaoRestaurar = event.target.closest('button.detalhe-restaurar-btn[data-action="restore-registro"]');
    if (botaoRestaurar) {
      event.preventDefault();
      const card = botaoRestaurar.closest('.detalhe-card');
      const registroId = String(card?.dataset?.registroId || '').trim();
      await restaurarAtestado(registroId);
      return;
    }

    const botaoAtendimento = event.target.closest('button.detalhe-marcar-btn[data-action="toggle-feito"]');
    if (!botaoAtendimento) return;

    event.preventDefault();
    const card = botaoAtendimento.closest('.detalhe-card');
    const registroId = String(card?.dataset?.registroId || '').trim();
    const registro = registrosProjeto.find((item) => String(item?.id || '') === registroId);
    const statusAtual = obterStatusAtendimento(registro);
    const statusDestino = statusAtual === 'feito' ? 'pendente' : 'feito';
    await marcarRegistroComoFeito(registroId, statusDestino);
  });
}

async function baixarArquivoComNome(urlArquivo, nomeDownload) {
  const urlComMetadata = await garantirMetadataDownload(urlArquivo, nomeDownload);
  const urlDownload = montarUrlForcarDownload(urlComMetadata, nomeDownload);
  const link = document.createElement('a');
  link.href = urlDownload;
  link.download = nomeDownload;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function ehUrlFirebaseStorage(urlArquivo) {
  try {
    const parsed = new URL(urlArquivo);
    return parsed.hostname === 'firebasestorage.googleapis.com';
  } catch {
    return false;
  }
}

function urlRequerProxyParaZip(urlArquivo) {
  try {
    const parsed = new URL(urlArquivo);
    const host = String(parsed.hostname || '').toLowerCase();
    return (
      host.includes('firebasestorage.googleapis.com') ||
      host.includes('storage.googleapis.com') ||
      host.includes('googleusercontent.com')
    );
  } catch {
    return false;
  }
}

async function backendZipEstaDisponivel(backendBase) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    const resposta = await fetch(`${backendBase}/api/health`, {
      method: 'GET',
      credentials: 'omit',
      signal: controller.signal
    });
    return resposta.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function obterBackendsZipDisponiveis() {
  const agora = Date.now();
  if (cacheBackendsZipAtualizadoEm && (agora - cacheBackendsZipAtualizadoEm) < 30000) {
    return cacheBackendsZipDisponiveis;
  }

  const candidatos = listarBackendsCandidatos();
  const disponiveis = [];

  for (const backendBase of candidatos) {
    // Evita tentar localhost:3001 quando o backend local nao esta no ar.
    const ok = await backendZipEstaDisponivel(backendBase);
    if (ok) {
      disponiveis.push(backendBase);
    }
  }

  cacheBackendsZipDisponiveis = disponiveis;
  cacheBackendsZipAtualizadoEm = agora;
  return disponiveis;
}

async function baixarBlobParaZip(urlArquivo, nomeArquivo, backendsDisponiveis = null) {
  let ultimoErroProxy = '';

  const backends = Array.isArray(backendsDisponiveis)
    ? backendsDisponiveis
    : await obterBackendsZipDisponiveis();

  if (urlRequerProxyParaZip(urlArquivo) && !backends.length) {
    throw new Error('BACKEND_PROXY_NOT_AVAILABLE');
  }

  try {
    const respostaDireta = await fetch(urlArquivo, { credentials: 'omit' });
    if (respostaDireta.ok) {
      return await respostaDireta.blob();
    }
  } catch {
    // tenta proxy via backend
  }

  if (!backends.length) {
    throw new Error('BACKEND_PROXY_NOT_AVAILABLE');
  }

  for (const backendBase of backends) {
    const proxyUrl = `${backendBase}/api/arquivos/proxy?url=${encodeURIComponent(urlArquivo)}&nome=${encodeURIComponent(nomeArquivo)}`;
    try {
      const respostaProxy = await fetch(proxyUrl, { credentials: 'omit' });
      if (respostaProxy.ok) {
        return await respostaProxy.blob();
      }
      ultimoErroProxy = `HTTP_${respostaProxy.status}`;
    } catch {
      // tenta próximo backend
      ultimoErroProxy = 'NETWORK_ERROR';
    }
  }

  throw new Error(ultimoErroProxy ? `BACKEND_PROXY_UNREACHABLE:${ultimoErroProxy}` : 'BACKEND_PROXY_UNREACHABLE');
}

async function baixarArquivosIndividualmente(arquivos) {
  let sucesso = 0;
  let falhas = 0;

  for (let i = 0; i < arquivos.length; i += 1) {
    const arquivo = arquivos[i];
    try {
      await baixarArquivoComNome(arquivo.url, arquivo.nome);
      sucesso += 1;
    } catch {
      falhas += 1;
    }

    if (i < arquivos.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  return { sucesso, falhas };
}

function ativarDownloadComNome() {
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a.download-pdf-link');
    if (!link) return;

    event.preventDefault();
    const raw = link.getAttribute('data-raw-url') || '';
    const urlArquivo = raw ? decodeURIComponent(raw) : (link.getAttribute('href') || '');
    const nomeCodificado = link.getAttribute('data-download-name') || '';
    const nomeDownload = nomeCodificado ? decodeURIComponent(nomeCodificado) : 'arquivo.pdf';

    try {
      await baixarArquivoComNome(urlArquivo, nomeDownload);
    } catch {
      setDetalhesStatus('Não foi possível iniciar o download deste arquivo.', 'error');
    }
  });
}

function coletarArquivosDosRegistros(registros) {
  return registros.flatMap((registro) => {
    const arquivos = Array.isArray(registro?.arquivos)
      ? registro.arquivos.map((arquivo) => (typeof arquivo === 'string' ? { url: arquivo } : arquivo))
      : (typeof registro?.arquivos === 'string' && registro.arquivos ? [{ url: registro.arquivos }] : []);

    return arquivos
      .filter((arquivo) => validarUrl(arquivo?.url || arquivo))
      .map((arquivo, indice) => ({
        url: arquivo?.url || arquivo,
        nome: obterNomeArquivoEnviado(arquivo, registro, indice, arquivos.length)
      }));
  });
}

function atualizarBotaoDownloadEmMassa() {
  if (!baixarFiltradosBtn) return;
  const totalArquivos = coletarArquivosDosRegistros(registrosProjetoFiltrados).length;
  baixarFiltradosBtn.textContent = totalArquivos > 0
    ? `Exportação em massa (${totalArquivos})`
    : 'Exportação em massa';
  baixarFiltradosBtn.disabled = totalArquivos === 0 || downloadMassaEmAndamento;
}

async function baixarPdfsFiltrados() {
  if (downloadMassaEmAndamento) return;

  let arquivos = coletarArquivosDosRegistros(registrosProjetoFiltrados);
  if (!arquivos.length) {
    const statusAlternativo = filtroAtendimentoAtual === 'pendente' ? 'feito' : 'pendente';
    const registrosBase = filtrarRegistrosSemAtendimento();
    const registrosAlternativos = registrosBase.filter((registro) => obterStatusAtendimento(registro) === statusAlternativo);
    const arquivosAlternativos = coletarArquivosDosRegistros(registrosAlternativos);

    if (arquivosAlternativos.length) {
      filtroAtendimentoAtual = statusAlternativo;
      atualizarBotoesFiltroAtendimento();
      aplicarFiltros();
      arquivos = arquivosAlternativos;
      setDetalhesStatus(`Sem arquivos no status atual. Exportando ${statusAlternativo === 'feito' ? 'Feitos' : 'Pendentes'} automaticamente.`, 'info');
    } else {
      setDetalhesStatus('Não há arquivos nos filtros atuais para exportar.', 'info');
      return;
    }
  }

  if (!window.JSZip) {
    setDetalhesStatus('Biblioteca ZIP não carregada. Atualize a página e tente novamente.', 'error');
    return;
  }

  downloadMassaEmAndamento = true;
  atualizarBotaoDownloadEmMassa();
  setDetalhesStatus('Gerando arquivo ZIP da exportação em massa...', 'info');

  try {
    const backendsZipDisponiveis = await obterBackendsZipDisponiveis();

    const zip = new window.JSZip();
    const nomesUsados = new Set();

    for (const arquivo of arquivos) {
      const blob = await baixarBlobParaZip(arquivo.url, arquivo.nome, backendsZipDisponiveis);
      let nome = arquivo.nome;
      if (nomesUsados.has(nome)) {
        const base = nome.replace(/\.pdf$/i, '');
        let i = 2;
        while (nomesUsados.has(`${base} (${i}).pdf`)) i += 1;
        nome = `${base} (${i}).pdf`;
      }
      nomesUsados.add(nome);
      zip.file(nome, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    const codigoProjeto = String(codigoProjetoAtual || 'projeto').trim() || 'projeto';
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `Exportacao-em-massa-Projeto-${codigoProjeto}-${timestamp}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);

    setDetalhesStatus(`ZIP gerado com sucesso: ${arquivos.length} arquivo(s).`, 'success');
  } catch (error) {
    const erroZipEsperado = String(error?.message || '').startsWith('BACKEND_PROXY_NOT_AVAILABLE') || String(error?.message || '').startsWith('BACKEND_PROXY_UNREACHABLE');
    if (!erroZipEsperado) {
      console.warn('Falha ao gerar ZIP de exportação em massa:', error);
    }

    if (erroZipEsperado) {
      setDetalhesStatus('Backend indisponível para ZIP. Iniciando download individual dos arquivos...', 'info');
      const resultado = await baixarArquivosIndividualmente(arquivos);

      if (resultado.sucesso > 0 && resultado.falhas === 0) {
        setDetalhesStatus(`ZIP indisponível no momento. Download individual concluído: ${resultado.sucesso} arquivo(s).`, 'success');
      } else if (resultado.sucesso > 0 && resultado.falhas > 0) {
        setDetalhesStatus(`ZIP indisponível no momento. Download individual parcial: ${resultado.sucesso} arquivo(s) baixado(s), ${resultado.falhas} falha(s).`, 'error');
      } else {
        setDetalhesStatus('Não foi possível gerar o ZIP e os downloads individuais também falharam.', 'error');
      }
    } else {
      setDetalhesStatus(`Não foi possível gerar o ZIP (${error?.message || 'falha desconhecida'}).`, 'error');
    }
  } finally {
    downloadMassaEmAndamento = false;
    atualizarBotaoDownloadEmMassa();
  }
}

function preencherFiltroTipo(registros) {
  const tiposUnicos = [...new Set(registros
    .map((registro) => String(registro?.tipo_atestado || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  filtroTipoSelect.innerHTML = '<option value="">Todos os tipos</option>';
  tiposUnicos.forEach((tipo) => {
    const option = document.createElement('option');
    option.value = tipo;
    option.textContent = tipo;
    filtroTipoSelect.appendChild(option);
  });
}

function aplicarFiltroTipoInicialDaUrl() {
  const params = new URLSearchParams(window.location.search);
  const tipoInicial = String(params.get('tipo') || '').trim();
  if (!tipoInicial) return;

  const optionExiste = Array.from(filtroTipoSelect.options).some((opt) => opt.value === tipoInicial);
  if (optionExiste) {
    filtroTipoSelect.value = tipoInicial;
  }
}

function filtrarPorCamposTexto(lista) {
  const nomeFiltro = normalizarTexto(filtroNomeInput.value);
  const dataInicioFiltro = filtroDataInicioInput.value;
  const dataFimFiltro = filtroDataFimInput.value;
  const dataMinFiltro = dataInicioFiltro && dataFimFiltro && dataInicioFiltro > dataFimFiltro ? dataFimFiltro : dataInicioFiltro;
  const dataMaxFiltro = dataInicioFiltro && dataFimFiltro && dataInicioFiltro > dataFimFiltro ? dataInicioFiltro : dataFimFiltro;
  const tipoFiltro = filtroTipoSelect.value;

  return lista.filter((registro) => {
    const nomeRegistro = normalizarTexto(registro?.nome);
    const dataRegistro = obterDataISO(registro?.criado_em);
    const tipoRegistro = String(registro?.tipo_atestado || '');

    const correspondeNome = !nomeFiltro || nomeRegistro.includes(nomeFiltro);
    const correspondeDataInicio = !dataMinFiltro || (dataRegistro && dataRegistro >= dataMinFiltro);
    const correspondeDataFim = !dataMaxFiltro || (dataRegistro && dataRegistro <= dataMaxFiltro);
    const correspondeTipo = !tipoFiltro || tipoRegistro === tipoFiltro;

    return correspondeNome && correspondeDataInicio && correspondeDataFim && correspondeTipo;
  });
}

function filtrarRegistrosSemAtendimento() {
  return filtrarPorCamposTexto(registrosProjeto.filter((r) => !r?.excluido));
}

function filtrarRegistrosExcluidos() {
  return filtrarPorCamposTexto(registrosProjeto.filter((r) => r?.excluido === true));
}

function selecionarFiltroAtendimentoComResultados() {
  const ativos = registrosProjeto.filter((r) => !r?.excluido);
  const pendentes = ativos.filter((registro) => obterStatusAtendimento(registro) === 'pendente').length;
  const feitos = ativos.filter((registro) => obterStatusAtendimento(registro) === 'feito').length;

  if (filtroAtendimentoAtual === 'pendente' && pendentes === 0 && feitos > 0) {
    filtroAtendimentoAtual = 'feito';
  } else if (filtroAtendimentoAtual === 'feito' && feitos === 0 && pendentes > 0) {
    filtroAtendimentoAtual = 'pendente';
  }

  atualizarBotoesFiltroAtendimento();
}

function aplicarFiltros() {
  detalhesContainer.innerHTML = '';

  if (filtroAtendimentoAtual === 'excluido') {
    const excluidos = filtrarRegistrosExcluidos();
    registrosProjetoFiltrados = excluidos;
    atualizarBotaoDownloadEmMassa();
    if (!excluidos.length) {
      setDetalhesStatus('Nenhum atestado na lixeira.', 'info');
      atualizarUrlEstadoDetalhes();
      return;
    }
    excluidos.forEach((registro) => detalhesContainer.appendChild(criarCardRegistro(registro)));
    setDetalhesStatus(`${excluidos.length} atestado(s) na lixeira.`, 'info');
    atualizarUrlEstadoDetalhes();
    return;
  }

  const baseFiltrada = filtrarRegistrosSemAtendimento();
  const atendimentoFiltro = filtroAtendimentoAtual;

  const filtrados = baseFiltrada.filter((registro) => {
    const statusAtendimento = obterStatusAtendimento(registro);
    return statusAtendimento === atendimentoFiltro;
  });

  registrosProjetoFiltrados = filtrados;
  atualizarBotaoDownloadEmMassa();

  if (!filtrados.length) {
    setDetalhesStatus('Nenhum registro encontrado com os filtros aplicados.', 'info');
    atualizarUrlEstadoDetalhes();
    return;
  }

  filtrados.forEach((registro) => detalhesContainer.appendChild(criarCardRegistro(registro)));
  const totalAtivos = registrosProjeto.filter((r) => !r?.excluido).length;
  setDetalhesStatus(`Mostrando ${filtrados.length} de ${totalAtivos} registro(s).`, 'success');
  atualizarUrlEstadoDetalhes();
}

function configurarEventosFiltros() {
  filtroNomeInput.addEventListener('input', aplicarFiltros);
  filtroDataInicioInput.addEventListener('change', aplicarFiltros);
  filtroDataFimInput.addEventListener('change', aplicarFiltros);
  filtroTipoSelect.addEventListener('change', aplicarFiltros);
  if (filtroPendentesBtn) {
    filtroPendentesBtn.addEventListener('click', () => definirFiltroAtendimento('pendente'));
  }
  if (filtroFeitosBtn) {
    filtroFeitosBtn.addEventListener('click', () => definirFiltroAtendimento('feito'));
  }
  if (filtroExcluidosBtn) {
    filtroExcluidosBtn.addEventListener('click', () => definirFiltroAtendimento('excluido'));
  }
  if (baixarFiltradosBtn) {
    baixarFiltradosBtn.addEventListener('click', baixarPdfsFiltrados);
  }
}

async function carregarDetalhesProjeto() {
  const params = new URLSearchParams(window.location.search);
  const codigoProjeto = obterCodigoProjetoSelecionado();
  codigoProjetoAtual = codigoProjeto;

  if (!codigoProjeto) {
    setDetalhesStatus('Projeto não informado.', 'error');
    return;
  }

  if (params.has('projeto') || params.has('origem')) {
    params.delete('projeto');
    params.delete('origem');
    const novaUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', novaUrl);
  }

  const tituloProjeto = obterTituloProjeto(codigoProjeto);
  projetoTitulo.textContent = tituloProjeto;
  projetoDescricao.textContent = BASES_PROJETO[codigoProjeto] || 'Bases relacionadas ao projeto selecionado.';

  setDetalhesStatus('Carregando informações preenchidas...', 'info');

  try {
    // Busca no Firestore e faz fallback para backend quando necessário.
    todosRegistros = await carregarEnviosComFallback();

    const resultadoMigracao = await migrarStatusAtendimentoLegado(todosRegistros);
    if (resultadoMigracao.migrados > 0 && resultadoMigracao.pendentes === 0) {
      setDetalhesStatus(`Sincronização concluída: ${resultadoMigracao.migrados} registro(s) de atendimento migrado(s).`, 'success');
    } else if (resultadoMigracao.migrados > 0 && resultadoMigracao.pendentes > 0) {
      setDetalhesStatus(`Sincronização parcial: ${resultadoMigracao.migrados} migrado(s), ${resultadoMigracao.pendentes} pendente(s).`, 'info');
    }

    registrosProjeto = todosRegistros.filter((registro) => correspondeProjeto(registro?.projeto, codigoProjeto));
    registrosProjetoFiltrados = registrosProjeto;

    if (!registrosProjeto.length) {
      detalhesContainer.innerHTML = '';
      preencherFiltroTipo([]);
      atualizarBotaoDownloadEmMassa();
      setDetalhesStatus('Nenhuma informação encontrada para este projeto.', 'info');
      return;
    }

    preencherFiltroTipo(registrosProjeto.filter((r) => !r?.excluido));
    aplicarFiltroTipoInicialDaUrl();
    restaurarEstadoFiltrosDaUrl();
    selecionarFiltroAtendimentoComResultados();
    aplicarFiltros();
  } catch (error) {
    setDetalhesStatus(`Erro ao carregar informações: ${error?.message || 'Falha ao carregar dados do projeto.'}`, 'error');
  }
}

ativarDownloadComNome();
ativarAcoesAtendimentoNosCards();
iniciarMonitoramentoAcessoRh();
configurarLinkVoltar();
configurarEventosFiltros();
carregarDetalhesProjeto();
