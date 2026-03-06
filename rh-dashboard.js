// Variáveis globais
let listaStatus = null;
let tabelaWrapper = null;
let tabelaBody = null;
let sairRhBtn = null;
let gerenciarUsuariosBtn = null;
let projetoCards = [];
let listaStatusTimer = null;
const BACKEND_URL = (localStorage.getItem('rh_backend_url') || '').trim().replace(/\/+$/, '');

let registrosCache = [];
let projetoSelecionado = '';

function inicializarElementosDom() {
  listaStatus = document.getElementById('listaStatus');
  tabelaWrapper = document.getElementById('tabelaWrapper');
  tabelaBody = document.getElementById('atestadosBody');
  sairRhBtn = document.getElementById('sairRhBtn');
  gerenciarUsuariosBtn = document.getElementById('gerenciarUsuariosBtn');
  projetoCards = Array.from(document.querySelectorAll('.projeto-card'));
  
  console.log('✅ Elementos DOM inicializados:', {
    listaStatus: !!listaStatus,
    tabelaWrapper: !!tabelaWrapper,
    tabelaBody: !!tabelaBody,
    sairRhBtn: !!sairRhBtn,
    gerenciarUsuariosBtn: !!gerenciarUsuariosBtn,
    projetoCards: projetoCards.length
  });
}

function setListaStatus(texto, tipo = 'info') {
  if (!listaStatus) return;

  if (listaStatusTimer) {
    clearTimeout(listaStatusTimer);
    listaStatusTimer = null;
  }

  listaStatus.textContent = texto;
  listaStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    listaStatus.classList.add('status-message--error');
  } else if (tipo === 'success') {
    listaStatus.classList.add('status-message--success');
  } else {
    listaStatus.classList.add('status-message--info');
  }

  if (tipo === 'success' || tipo === 'info') {
    listaStatusTimer = setTimeout(() => {
      if (!listaStatus) return;
      listaStatus.textContent = '';
      listaStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
      listaStatusTimer = null;
    }, 4000);
  }
}

function formatarData(valorData) {
  if (!valorData || typeof valorData !== 'string') {
    return '-';
  }

  const partes = valorData.split('-');
  if (partes.length !== 3) {
    return valorData;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatarDataHora(valorDataHora) {
  if (!valorDataHora || typeof valorDataHora !== 'string') {
    return '-';
  }

  const data = new Date(valorDataHora);
  if (Number.isNaN(data.getTime())) {
    return valorDataHora;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(data);
}

function formatarDataCurtaParaNome(dataISO) {
  if (!dataISO || typeof dataISO !== 'string') {
    return '00.00.00';
  }

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


function montarLinkArquivo(record, urlArquivo) {
  // urlArquivo já é a URL do Firebase Storage
  return urlArquivo;
}

async function baixarArquivoComNome(urlArquivo, nomeDownload) {
  const urlDownload = montarUrlForcarDownload(urlArquivo, nomeDownload);
  const linkTemporario = document.createElement('a');
  linkTemporario.href = urlDownload;
  linkTemporario.download = nomeDownload;
  document.body.appendChild(linkTemporario);
  linkTemporario.click();
  linkTemporario.remove();
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

function ativarDownloadComNome() {
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a.download-pdf-link');
    if (!link) {
      return;
    }

    event.preventDefault();

    const raw = link.getAttribute('data-raw-url') || '';
    const urlArquivo = raw ? decodeURIComponent(raw) : (link.getAttribute('href') || '');
    const nomeCodificado = link.getAttribute('data-download-name') || '';
    const nomeDownload = nomeCodificado ? decodeURIComponent(nomeCodificado) : (link.getAttribute('download') || 'arquivo.pdf');

    try {
      const urlComMetadata = await garantirMetadataDownload(urlArquivo, nomeDownload);
      await baixarArquivoComNome(urlComMetadata, nomeDownload);
    } catch {
      setListaStatus('Nao foi possivel iniciar o download deste arquivo.', 'error');
    }
  });
}

// Sanitizar conteúdo que será exibido
function sanitizarTexto(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto || '');
  return div.innerHTML;
}

// Validar URL
function validarUrl(url) {
  try {
    const urlObj = new URL(url);
    // Permitir apenas http, https
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
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

function erroPermissaoFirestore(error) {
  const texto = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return texto.includes('permission-denied') || texto.includes('missing or insufficient permissions');
}

function resolverBackendUrl() {
  return BACKEND_URL;
}

async function requisicaoBackendJson(url, options = {}, tentativas = 2) {
  let ultimaResposta = null;

  for (let i = 0; i <= tentativas; i += 1) {
    const resposta = await fetch(url, options);
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

async function carregarEnviosComFallback() {
  try {
    const snapshot = await window.firebase.firestore().collection('envios_atestados').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    if (!erroPermissaoFirestore(error)) {
      throw error;
    }

    const backendBase = resolverBackendUrl();
    if (!backendBase) {
      throw new Error('Sem permissão no Firestore para ler envios_atestados. Publique regras no Firebase Console liberando leitura desta coleção para o painel RH.');
    }

    try {
      const dados = await requisicaoBackendJson(`${backendBase}/api/envios?limit=1000`);
      return Array.isArray(dados) ? dados : [];
    } catch {
      throw new Error(`Backend indisponível (${backendBase}) e Firestore sem permissão para envios_atestados.`);
    }
  }
}

function criarLinhaRegistro(record) {
  const tr = document.createElement('tr');

  // Suporte a diferentes formatos de 'arquivos' (array de objetos, array de strings, string)
  let arquivos = [];
  if (Array.isArray(record.arquivos)) {
    // Pode ser array de objetos {url, nome, tipo} ou array de strings
    arquivos = record.arquivos.map(a => (typeof a === 'string' ? { url: a } : a));
  } else if (typeof record.arquivos === 'string' && record.arquivos) {
    arquivos = [{ url: record.arquivos }];
  }

  // Criar células usando textContent para evitar XSS
  const tdNome = document.createElement('td');
  tdNome.textContent = record.nome || '-';
  tr.appendChild(tdNome);

  const tdFuncao = document.createElement('td');
  tdFuncao.textContent = record.funcao || '-';
  tr.appendChild(tdFuncao);

  const tdProjeto = document.createElement('td');
  tdProjeto.textContent = record.projeto || '-';
  tr.appendChild(tdProjeto);

  const tdTipo = document.createElement('td');
  tdTipo.textContent = record.tipo_atestado || '-';
  tr.appendChild(tdTipo);

  const tdInicio = document.createElement('td');
  tdInicio.textContent = formatarData(record.data_inicio);
  tr.appendChild(tdInicio);

  const tdFim = document.createElement('td');
  tdFim.textContent = formatarData(record.data_fim);
  tr.appendChild(tdFim);

  const tdDias = document.createElement('td');
  tdDias.textContent = record.dias || '-';
  tr.appendChild(tdDias);

  const tdCriado = document.createElement('td');
  tdCriado.textContent = formatarDataHora(record.criado_em);
  tr.appendChild(tdCriado);

  // Container para arquivos
  const tdArquivos = document.createElement('td');
  
  if (arquivos.length > 0) {
    arquivos.forEach((arquivo, indice) => {
      const urlArquivo = arquivo.url || arquivo;
      if (!validarUrl(urlArquivo)) {
        console.warn('URL de arquivo inválida:', urlArquivo);
        return;
      }
      const nomeExibicao = obterNomeArquivoEnviado(arquivo, record, indice, arquivos.length);
      const link = document.createElement('a');
      link.className = 'download-pdf-link';
      link.href = montarUrlForcarDownload(urlArquivo, nomeExibicao);
      link.download = nomeExibicao;
      link.setAttribute('data-download-name', encodeURIComponent(nomeExibicao));
      link.setAttribute('data-raw-url', encodeURIComponent(urlArquivo));

      const nomeArquivoSpan = document.createElement('span');
      nomeArquivoSpan.className = 'download-file-name';
      nomeArquivoSpan.textContent = nomeExibicao;

      const baixarSpan = document.createElement('span');
      baixarSpan.className = 'download-file-action';
      baixarSpan.textContent = 'Baixar';

      link.appendChild(nomeArquivoSpan);
      link.appendChild(baixarSpan);
      tdArquivos.appendChild(link);
      if (indice < arquivos.length - 1) {
        tdArquivos.appendChild(document.createElement('br'));
      }
    });
  } else {
    tdArquivos.textContent = '-';
  }
  tr.appendChild(tdArquivos);

  return tr;
}

function atualizarEstadoAbasProjeto() {
  projetoCards.forEach((card) => {
    const ativo = card.dataset.projeto === projetoSelecionado;
    card.classList.toggle('active', ativo);
    card.setAttribute('aria-selected', ativo ? 'true' : 'false');
  });
}

function filtrarRegistrosPorProjeto(registros) {
  if (!projetoSelecionado) {
    return registros;
  }

  const padraoProjeto = new RegExp(`\\b${projetoSelecionado}\\b`);
  return registros.filter((registro) => padraoProjeto.test(String(registro?.projeto || '')));
}

function renderizarTabela(registros) {
  tabelaBody.innerHTML = '';

  if (!registros.length) {
    const sufixoProjeto = projetoSelecionado ? ` para Projeto - ${projetoSelecionado}` : '';
    setListaStatus(`Nenhum atestado/declaração encontrado${sufixoProjeto}.`, 'info');
    tabelaWrapper.classList.add('hidden');
    return;
  }

  registros.forEach((registro) => {
    tabelaBody.appendChild(criarLinhaRegistro(registro));
  });

  if (projetoSelecionado) {
    setListaStatus(`Total de registros do Projeto - ${projetoSelecionado}: ${registros.length}`, 'success');
  } else {
    setListaStatus(`Total de registros: ${registros.length}`, 'success');
  }

  tabelaWrapper.classList.remove('hidden');
}

function aplicarFiltroProjeto(codigoProjeto) {
  projetoSelecionado = codigoProjeto;
  atualizarEstadoAbasProjeto();
  renderizarTabela(filtrarRegistrosPorProjeto(registrosCache));
}

window.aplicarFiltroProjeto = aplicarFiltroProjeto;





async function carregarAtestados() {
  setListaStatus('Carregando atestados...', 'info');
  tabelaWrapper.classList.add('hidden');
  try {
    registrosCache = await carregarEnviosComFallback();
    renderizarTabela(filtrarRegistrosPorProjeto(registrosCache));
  } catch (error) {
    setListaStatus(`Erro ao carregar atestados: ${error?.message || 'Falha ao buscar dados.'}`, 'error');
  }
}

function adicionarEventListeners() {
  console.log('✅ Event listeners já gerenciados pelo HTML onclick');
  // Os event listeners agora estão no HTML com onclick direto
}

// Inicialização simples
function inicializarDashboard() {
  console.log('✅ Inicializando dashboard RH');
  inicializarElementosDom();
  ativarDownloadComNome();
  if (tabelaWrapper) {
    tabelaWrapper.classList.add('hidden');
  }
  setListaStatus('Selecione um projeto para abrir os registros.', 'info');
  
  // Mostrar botão de admin
  if (gerenciarUsuariosBtn) {
    gerenciarUsuariosBtn.classList.remove('hidden');
    console.log('✅ Botão admin visível');
  }
}

// Executar quando DOM está pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarDashboard);
} else {
  inicializarDashboard();
}
