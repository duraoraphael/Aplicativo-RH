const form = document.getElementById('rh-form');
const tipoAtestado = document.getElementById('tipoAtestado');
const horasWrapper = document.getElementById('horasComparecimentoWrapper');
const horasInput = document.getElementById('horasComparecimento');
const diasWrapper = document.getElementById('diasWrapper');
const dataInicio = document.getElementById('dataInicio');
const dataFim = document.getElementById('dataFim');
const dias = document.getElementById('dias');
const arquivos = document.getElementById('arquivos');
const projetoSelect = document.getElementById('projeto');
const mensagem = document.getElementById('mensagem');
const uploadProgressWrapper = document.getElementById('uploadProgressWrapper');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadProgressText = document.getElementById('uploadProgressText');
const botaoEnviar = form.querySelector('button[type="submit"]');
const rhAccessBtn = document.getElementById('rhAccessBtn');
const gateProjetoSelect = document.getElementById('gateProjeto');
const gateProjetoFiltro = document.getElementById('gateProjetoFiltro');
const gateProjetoFiltroInfo = document.getElementById('gateProjetoFiltroInfo');
const gateProjetoCards = Array.from(document.querySelectorAll('.gate-projeto-card'));
const gateContinuarBtn = document.getElementById('gateContinuarBtn');
const projectGateCard = document.getElementById('projectGateCard');
const projectGateInfo = document.getElementById('projectGateInfo');
let mensagemStatusTimer = null;
let gateProjetoInicializado = false;
let projetoSelecionadoNoGate = '';




const MS_POR_DIA = 24 * 60 * 60 * 1000;
const MAX_LADO_IMAGEM_PDF = 1600;
const QUALIDADE_JPEG_PDF = 0.82;
const PROJETO_PRESELECIONADO_KEY = 'rh_projeto_preselecionado';
const GATE_FILTRO_BUSCA_KEY = 'rh_gate_filtro_busca';
const FORMULARIO_PAGE_PATH = 'formulario.html';

function normalizarProjeto(valor) {
  return String(valor || '').trim();
}

function normalizarTextoBusca(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function obterValorParamUrl(nomeParam) {
  try {
    const url = new URL(window.location.href);
    return String(url.searchParams.get(nomeParam) || '').trim();
  } catch {
    return '';
  }
}

function atualizarParamUrlSemRecarregar(nomeParam, valorParam) {
  try {
    const url = new URL(window.location.href);
    const valor = String(valorParam || '').trim();
    if (valor) {
      url.searchParams.set(nomeParam, valor);
    } else {
      url.searchParams.delete(nomeParam);
    }

    const novaUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', novaUrl);
  } catch {
    // Ignora falhas de parse de URL para nao afetar fluxo principal.
  }
}

function obterFiltroBuscaInicialGate() {
  const buscaUrl = obterValorParamUrl('busca');
  const buscaLocal = String(localStorage.getItem(GATE_FILTRO_BUSCA_KEY) || '').trim();
  return buscaUrl || buscaLocal;
}

function atualizarEstadoNavegacaoGate(projeto = '', busca = '') {
  atualizarParamUrlSemRecarregar('projeto', normalizarProjeto(projeto));
  atualizarParamUrlSemRecarregar('busca', String(busca || '').trim());
}

function atualizarMensagemGate(texto, tipo = 'info') {
  if (!projectGateInfo) return;

  projectGateInfo.textContent = texto;
  projectGateInfo.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    projectGateInfo.classList.add('status-message--error');
  } else if (tipo === 'success') {
    projectGateInfo.classList.add('status-message--success');
  } else {
    projectGateInfo.classList.add('status-message--info');
  }
}

function bloquearCampoProjeto(valorProjeto) {
  const valor = normalizarProjeto(valorProjeto);
  if (!projetoSelect || !valor) return;

  projetoSelect.value = valor;
  projetoSelect.disabled = true;
  projetoSelect.classList.add('is-locked');
  projetoSelect.required = false;
}

function obterProjetoSelecionadoInicial() {
  let projetoDaUrl = '';
  try {
    const url = new URL(window.location.href);
    projetoDaUrl = normalizarProjeto(url.searchParams.get('projeto'));
  } catch {
    projetoDaUrl = '';
  }

  const projetoLocal = normalizarProjeto(localStorage.getItem(PROJETO_PRESELECIONADO_KEY));
  return projetoDaUrl || projetoLocal;
}

function redirecionarParaFormularioComProjeto(valorProjeto) {
  const valor = normalizarProjeto(valorProjeto);
  if (!valor) {
    atualizarMensagemGate('Selecione um projeto para continuar.', 'error');
    return;
  }

  localStorage.setItem(PROJETO_PRESELECIONADO_KEY, valor);
  const params = new URLSearchParams();
  params.set('projeto', valor);
  params.set('origem', 'index.html');

  const buscaAtual = String(gateProjetoFiltro?.value || '').trim();
  if (buscaAtual) {
    params.set('busca', buscaAtual);
    localStorage.setItem(GATE_FILTRO_BUSCA_KEY, buscaAtual);
  }

  const destino = `${FORMULARIO_PAGE_PATH}?${params.toString()}`;
  window.location.href = destino;
}

function liberarFormularioComProjeto(valorProjeto) {
  const valor = normalizarProjeto(valorProjeto);
  if (!valor) {
    atualizarMensagemGate('Selecione um projeto valido para continuar.', 'error');
    return;
  }

  bloquearCampoProjeto(valor);
  localStorage.setItem(PROJETO_PRESELECIONADO_KEY, valor);

  gateProjetoCards.forEach((card) => {
    const ativo = normalizarProjeto(card.dataset.projeto) === valor;
    card.classList.toggle('active', ativo);
  });

  form.classList.remove('hidden');
  if (projectGateCard) {
    projectGateCard.classList.add('hidden');
  }

  definirMensagemStatus(`Projeto selecionado: ${valor}. Campo projeto bloqueado para envio.`, 'success');
}

function selecionarProjetoDoGate(valorProjeto) {
  const valor = normalizarProjeto(valorProjeto);
  if (!valor) {
    atualizarMensagemGate('Selecione um projeto para continuar.', 'error');
    return;
  }

  redirecionarParaFormularioComProjeto(valor);
}

function atualizarInfoFiltroProjetos(totalVisiveis, totalProjetos, termo) {
  if (!gateProjetoFiltroInfo) return;

  const termoNormalizado = normalizarProjeto(termo);
  if (!termoNormalizado) {
    gateProjetoFiltroInfo.textContent = 'Mostrando todos os projetos.';
    return;
  }

  gateProjetoFiltroInfo.textContent = `${totalVisiveis} de ${totalProjetos} projeto(s) encontrado(s) para "${termoNormalizado}".`;
}

function aplicarFiltroProjetosGate(termoBusca = '') {
  if (!gateProjetoCards.length) return;

  const termo = normalizarTextoBusca(termoBusca);
  const termos = termo ? termo.split(/\s+/).filter(Boolean) : [];
  const termoOriginal = String(termoBusca || '').trim();
  let visiveis = 0;

  gateProjetoCards.forEach((card) => {
    const projeto = normalizarTextoBusca(card.dataset.projeto);
    const deveMostrar = !termos.length || termos.every((parte) => projeto.includes(parte));
    card.classList.toggle('hidden', !deveMostrar);
    card.setAttribute('aria-hidden', deveMostrar ? 'false' : 'true');
    if (deveMostrar) visiveis += 1;
  });

  atualizarInfoFiltroProjetos(visiveis, gateProjetoCards.length, termoBusca);
  if (termoOriginal) {
    localStorage.setItem(GATE_FILTRO_BUSCA_KEY, termoOriginal);
  } else {
    localStorage.removeItem(GATE_FILTRO_BUSCA_KEY);
  }

  atualizarEstadoNavegacaoGate(projetoSelecionadoNoGate, termoOriginal);
}

function atualizarLinkVoltarFormulario() {
  const backLink = document.querySelector('.form-back-btn');
  if (!backLink) return;

  const params = new URLSearchParams();
  const projeto = normalizarProjeto(projetoSelecionadoNoGate || projetoSelect?.value || localStorage.getItem(PROJETO_PRESELECIONADO_KEY));
  const busca = String(obterValorParamUrl('busca') || localStorage.getItem(GATE_FILTRO_BUSCA_KEY) || '').trim();

  if (projeto) {
    params.set('projeto', projeto);
  }
  if (busca) {
    params.set('busca', busca);
  }

  backLink.href = `index.html${params.toString() ? `?${params.toString()}` : ''}`;
}

function inicializarGateProjeto() {
  if (gateProjetoInicializado || !projetoSelect || !form) {
    return;
  }
  gateProjetoInicializado = true;

  const gateDisponivel = Boolean(projectGateCard || gateProjetoSelect || gateProjetoCards.length);
  const projetoInicial = obterProjetoSelecionadoInicial();

  if (!gateDisponivel) {
    if (!projetoInicial) {
      window.location.href = 'index.html';
      return;
    }

    if (Array.from(projetoSelect.options).some((opt) => opt.value === projetoInicial)) {
      liberarFormularioComProjeto(projetoInicial);
      return;
    }

    window.location.href = 'index.html';
    return;
  }

  if (projectGateCard) {
    projectGateCard.classList.remove('hidden');
  }
  form.classList.add('hidden');

  const projetoSalvo = projetoInicial;
  if (projetoSalvo && gateProjetoSelect) {
    const projetoValidoNoSelect = Array.from(gateProjetoSelect.options).some((opt) => opt.value === projetoSalvo);
    if (projetoValidoNoSelect) {
      gateProjetoSelect.value = projetoSalvo;
      projetoSelecionadoNoGate = projetoSalvo;
      atualizarEstadoNavegacaoGate(projetoSelecionadoNoGate, obterFiltroBuscaInicialGate());
    }
  }

  if (projetoSelecionadoNoGate) {
    gateProjetoCards.forEach((card) => {
      const ativo = normalizarProjeto(card.dataset.projeto) === projetoSelecionadoNoGate;
      card.classList.toggle('active', ativo);
    });
  }

  if (gateContinuarBtn) {
    const projetoInicial = normalizarProjeto(projetoSelecionadoNoGate || gateProjetoSelect?.value);
    gateContinuarBtn.disabled = !projetoInicial;
    if (projetoInicial) {
      gateContinuarBtn.dataset.projetoSelecionado = projetoInicial;
    }
    gateContinuarBtn.addEventListener('click', () => {
      const projeto = normalizarProjeto(gateContinuarBtn.dataset.projetoSelecionado || projetoSelecionadoNoGate || gateProjetoSelect?.value);
      redirecionarParaFormularioComProjeto(projeto);
    });
  }

  atualizarMensagemGate('Selecione o projeto para liberar o formulario.', 'info');

  if (gateProjetoFiltro) {
    gateProjetoFiltro.value = obterFiltroBuscaInicialGate();
    gateProjetoFiltro.addEventListener('input', () => {
      aplicarFiltroProjetosGate(gateProjetoFiltro.value);
    });
    aplicarFiltroProjetosGate(gateProjetoFiltro.value);
  }

  gateProjetoCards.forEach((card) => {
    card.addEventListener('click', () => {
      selecionarProjetoDoGate(card.dataset.projeto);
    });

    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selecionarProjetoDoGate(card.dataset.projeto);
      }
    });
  });

  if (gateProjetoSelect) {
    gateProjetoSelect.addEventListener('change', () => {
      selecionarProjetoDoGate(gateProjetoSelect.value);
    });
  }

  atualizarLinkVoltarFormulario();

  document.addEventListener('click', (event) => {
    const card = event.target.closest('.gate-projeto-card');
    if (!card) return;
    selecionarProjetoDoGate(card.dataset.projeto);
  });
}

// Função para registrar eventos no Firestore (opcional)
async function registrarEventoBackend(acao, detalhes = {}) {
  try {
    await window.db.collection('eventos_frontend').add({
      acao,
      pagina: 'index.html',
      email: localStorage.getItem('rh_user_email') || '',
      usuarioId: localStorage.getItem('rh_user_id') || '',
      detalhes,
      criado_em: new Date().toISOString()
    });
  } catch {}
}

function toUTCDate(dateString) {
  const valor = String(dateString || '').trim();
  if (!valor) return new Date(NaN);

  let ano;
  let mes;
  let dia;

  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    [ano, mes, dia] = valor.split('-').map(Number);
  } else if (/^\d{2}-\d{2}-\d{4}$/.test(valor)) {
    [dia, mes, ano] = valor.split('-').map(Number);
  } else {
    return new Date(NaN);
  }

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return new Date(NaN);
  }

  return data;
}

function toInputDate(dateObj) {
  const ano = dateObj.getUTCFullYear();
  const mes = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${dia}/${mes}/${ano}`;
}

function obterDataHojeLocalISO() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function isoParaDisplay(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) {
    return '';
  }
  const [ano, mes, dia] = String(isoDate).split('-');
  return `${dia}/${mes}/${ano}`;
}

function displayParaISO(displayDate) {
  const valor = String(displayDate || '').trim().replace(/\//g, '-');
  if (!/^\d{2}-\d{2}-\d{4}$/.test(valor)) {
    return '';
  }
  const [dia, mes, ano] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return '';
  }
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function normalizarDigitacaoData(input) {
  if (!input) return;
  const apenasDigitos = String(input.value || '').replace(/\D/g, '').slice(0, 8);
  let formatado = apenasDigitos;
  if (apenasDigitos.length > 2) {
    formatado = `${apenasDigitos.slice(0, 2)}/${apenasDigitos.slice(2)}`;
  }
  if (apenasDigitos.length > 4) {
    formatado = `${apenasDigitos.slice(0, 2)}/${apenasDigitos.slice(2, 4)}/${apenasDigitos.slice(4)}`;
  }
  input.value = formatado;
}

function validarDatasNaoFuturas() {
  const hojeISO = obterDataHojeLocalISO();
  const hojeDisplay = isoParaDisplay(hojeISO);
  const isoInicio = displayParaISO(dataInicio.value);
  const isoFim = displayParaISO(dataFim.value);

  const hoje = toUTCDate(hojeISO);

  if (!dataInicio.value) {
    dataInicio.setCustomValidity('');
  } else if (!isoInicio) {
    dataInicio.setCustomValidity('Use o formato DD-MM-AAAA com data válida.');
  } else {
    const inicio = toUTCDate(isoInicio);
    if (inicio > hoje) {
      dataInicio.setCustomValidity(`A data de início não pode ser futura. Máximo: ${hojeDisplay}.`);
    } else {
      dataInicio.setCustomValidity('');
    }
  }

  if (!dataFim.value) {
    dataFim.setCustomValidity('');
  } else if (!isoFim) {
    dataFim.setCustomValidity('Use o formato DD-MM-AAAA com data válida.');
  } else {
    const fim = toUTCDate(isoFim);
    if (fim > hoje) {
      dataFim.setCustomValidity(`A data de fim não pode ser futura. Máximo: ${hojeDisplay}.`);
    } else if (isoInicio && fim < toUTCDate(isoInicio)) {
      dataFim.setCustomValidity('A data de fim deve ser igual ou maior que a data de início.');
    } else {
      dataFim.setCustomValidity('');
    }
  }
}

function calcularDiasPorIntervalo() {
  const isoInicio = displayParaISO(dataInicio.value);
  const isoFim = displayParaISO(dataFim.value);
  if (!isoInicio || !isoFim) {
    return;
  }

  const inicio = toUTCDate(isoInicio);
  const fim = toUTCDate(isoFim);
  const diferenca = Math.floor((fim - inicio) / MS_POR_DIA) + 1;

  if (diferenca >= 1) {
    dias.value = String(diferenca);
    dataFim.setCustomValidity('');
  } else {
    dataFim.setCustomValidity('A data de fim deve ser igual ou maior que a data de início.');
  }
}

function calcularFimPorDias() {
  if (tipoAtestado.value === 'Declaração') {
    const isoInicioDeclaracao = displayParaISO(dataInicio.value);
    if (isoInicioDeclaracao) {
      dataFim.value = toInputDate(toUTCDate(isoInicioDeclaracao));
      dias.value = '1';
      dataFim.setCustomValidity('');
    }
    return;
  }

  const isoInicio = displayParaISO(dataInicio.value);
  if (!isoInicio || !dias.value) {
    return;
  }

  const totalDias = Number(dias.value);
  if (!Number.isInteger(totalDias) || totalDias < 1) {
    return;
  }

  const inicio = toUTCDate(isoInicio);
  const fim = new Date(inicio.getTime() + (totalDias - 1) * MS_POR_DIA);
  dataFim.value = toInputDate(fim);
  dataFim.setCustomValidity('');
}

function atualizarCampoHoras() {
  const isDeclaracao = tipoAtestado.value === 'Declaração';
  horasWrapper.classList.toggle('hidden', !isDeclaracao);
  horasInput.required = isDeclaracao;
  if (diasWrapper) {
    diasWrapper.classList.toggle('hidden', isDeclaracao);
  }
  dias.required = !isDeclaracao;

  if (!isDeclaracao) {
    horasInput.value = '';
  } else {
    dias.value = '1';
    calcularFimPorDias();
  }
}

function nomePdf(nomeOriginal) {
  const semExtensao = nomeOriginal.replace(/\.[^/.]+$/, '');
  return `${semExtensao}.pdf`;
}

function formatarDataCurtaParaNome(dataISO) {
  if (!dataISO || typeof dataISO !== 'string') {
    return '00.00.0000';
  }

  const iso = /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(dataISO) ? displayParaISO(dataISO) : dataISO;
  const [ano, mes, dia] = String(iso || '').split('-');
  return `${dia || '00'}.${mes || '00'}.${ano || '0000'}`;
}

function normalizarNomePessoaParaArquivo(nomePessoa) {
  return String(nomePessoa || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function sanitizarNomeArquivo(nomeArquivo) {
  return nomeArquivo
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function montarNomePdfPadrao() {
  const nomePessoa = normalizarNomePessoaParaArquivo(document.getElementById('nome').value);
  const dataInicioCurta = formatarDataCurtaParaNome(dataInicio.value);

  if (tipoAtestado.value === 'Declaração') {
    return sanitizarNomeArquivo(`DECLARAÇÃO MÉDICA - ${dataInicioCurta} - ${nomePessoa}.pdf`);
  }

  const totalDias = Number(dias.value) || 0;
  const labelDias = totalDias === 1 ? 'DIA' : 'DIAS';
  return sanitizarNomeArquivo(`ATESTADO MÉDICO - ${dataInicioCurta} (${totalDias} ${labelDias}) - ${nomePessoa}.pdf`);
}

function definirEstadoEnvio(carregando, textoBotao = 'Enviar') {
  botaoEnviar.disabled = carregando;
  botaoEnviar.textContent = carregando ? 'Enviando...' : textoBotao;
}

function atualizarProgressoUpload(percentual, texto = '') {
  if (!uploadProgressWrapper || !uploadProgressBar || !uploadProgressText) {
    return;
  }

  const valor = Math.max(0, Math.min(100, Math.round(percentual)));
  uploadProgressWrapper.classList.remove('hidden');
  uploadProgressBar.value = valor;
  uploadProgressText.textContent = texto || `${valor}%`;
}

function ocultarProgressoUpload() {
  if (!uploadProgressWrapper || !uploadProgressBar || !uploadProgressText) {
    return;
  }

  uploadProgressBar.value = 0;
  uploadProgressText.textContent = '0%';
  uploadProgressWrapper.classList.add('hidden');
}


function uploadComProgresso(storageRef, blob, bytesTransferidosPorArquivo, indiceArquivo, totalBytes, nomeArquivoDownload = 'arquivo.pdf') {
  return new Promise((resolve, reject) => {
    const nomeSeguroHeader = String(nomeArquivoDownload || 'arquivo.pdf')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._ -]/g, '_');

    const uploadTask = storageRef.put(blob, {
      contentType: 'application/pdf',
      contentDisposition: `attachment; filename="${nomeSeguroHeader}"`
    });

    uploadTask.on('state_changed', (snapshot) => {
      bytesTransferidosPorArquivo[indiceArquivo] = snapshot.bytesTransferred;
      const totalTransferido = bytesTransferidosPorArquivo.reduce((acc, atual) => acc + atual, 0);
      const percentual = totalBytes > 0 ? (totalTransferido / totalBytes) * 100 : 0;
      atualizarProgressoUpload(percentual, `${Math.round(percentual)}%`);
    }, reject, async () => {
      try {
        const url = await uploadTask.snapshot.ref.getDownloadURL();
        resolve(url);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function definirMensagemStatus(texto, tipo = 'info') {
  if (!mensagem) {
    return;
  }

  if (mensagemStatusTimer) {
    clearTimeout(mensagemStatusTimer);
    mensagemStatusTimer = null;
  }

  mensagem.textContent = texto;
  mensagem.style.color = '';
  mensagem.classList.remove('status-message--info', 'status-message--success', 'status-message--error');

  if (tipo === 'error') {
    mensagem.classList.add('status-message--error');
  } else if (tipo === 'success') {
    mensagem.classList.add('status-message--success');
  } else {
    mensagem.classList.add('status-message--info');
  }

  if (tipo === 'success' || tipo === 'info') {
    mensagemStatusTimer = setTimeout(() => {
      mensagem.textContent = '';
      mensagem.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
      mensagemStatusTimer = null;
    }, 4000);
  }
}

function blobParaArquivoPdf(blob, nomeArquivo) {
  return new File([blob], nomeArquivo, { type: 'application/pdf' });
}

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao converter arquivo para base64.'));
    reader.readAsDataURL(blob);
  });
}

async function converterImagemParaPdf(arquivo) {
  const { jsPDF } = window.jspdf;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(arquivo);
  });

  const imagem = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Imagem inválida para conversão.'));
    img.src = dataUrl;
  });

  const escalaReducao = Math.min(
    1,
    MAX_LADO_IMAGEM_PDF / Math.max(imagem.width, imagem.height)
  );
  const larguraProcessada = Math.max(1, Math.round(imagem.width * escalaReducao));
  const alturaProcessada = Math.max(1, Math.round(imagem.height * escalaReducao));

  const canvas = document.createElement('canvas');
  canvas.width = larguraProcessada;
  canvas.height = alturaProcessada;
  const contexto = canvas.getContext('2d');
  if (!contexto) {
    throw new Error('Falha ao processar imagem para PDF.');
  }

  contexto.drawImage(imagem, 0, 0, larguraProcessada, alturaProcessada);

  const manterPng = arquivo.type.includes('png');
  const formatoImagem = manterPng ? 'PNG' : 'JPEG';
  const dataUrlProcessada = manterPng
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', QUALIDADE_JPEG_PDF);

  const orientacao = larguraProcessada > alturaProcessada ? 'l' : 'p';
  const pdf = new jsPDF({ orientation: orientacao, unit: 'pt', format: 'a4' });
  const larguraPagina = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();

  const escala = Math.min(larguraPagina / larguraProcessada, alturaPagina / alturaProcessada);
  const larguraFinal = larguraProcessada * escala;
  const alturaFinal = alturaProcessada * escala;
  const x = (larguraPagina - larguraFinal) / 2;
  const y = (alturaPagina - alturaFinal) / 2;

  pdf.addImage(dataUrlProcessada, formatoImagem, x, y, larguraFinal, alturaFinal);
  return pdf.output('blob');
}

async function converterTxtParaPdf(arquivo) {
  const { jsPDF } = window.jspdf;
  const texto = await arquivo.text();
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const margem = 40;
  const largura = pdf.internal.pageSize.getWidth() - margem * 2;
  const linhas = pdf.splitTextToSize(texto || ' ', largura);
  let y = 52;

  linhas.forEach((linha) => {
    if (y > pdf.internal.pageSize.getHeight() - 40) {
      pdf.addPage();
      y = 52;
    }
    pdf.text(linha, margem, y);
    y += 18;
  });

  return pdf.output('blob');
}

async function converterArquivoParaPdf(arquivo) {
  if (arquivo.type === 'application/pdf') {
    return { blob: arquivo, nome: nomePdf(arquivo.name) };
  }

  if (arquivo.type.startsWith('image/')) {
    const blob = await converterImagemParaPdf(arquivo);
    return { blob, nome: nomePdf(arquivo.name) };
  }

  if (arquivo.type === 'text/plain') {
    const blob = await converterTxtParaPdf(arquivo);
    return { blob, nome: nomePdf(arquivo.name) };
  }

  return null;
}

function montarFormDataEnvio(arquivosConvertidos) {
  const formData = new FormData();
  formData.append('nome', document.getElementById('nome').value.trim());
  formData.append('funcao', document.getElementById('funcao').value.trim());
  formData.append('projeto', document.getElementById('projeto').value);
  formData.append('tipo_atestado', tipoAtestado.value);
  formData.append('horas_comparecimento', horasInput.value ? String(Number(horasInput.value)) : '');
  formData.append('data_inicio', dataInicio.value);
  formData.append('data_fim', dataFim.value);
  formData.append('dias', String(Number(dias.value)));

  const nomePdfPadrao = montarNomePdfPadrao();
  arquivosConvertidos.forEach((arquivoConvertido, indice) => {
    const nomeArquivo = arquivosConvertidos.length > 1
      ? nomePdfPadrao.replace('.pdf', ` - ANEXO ${indice + 1}.pdf`)
      : nomePdfPadrao;
    const arquivoPdf = blobParaArquivoPdf(arquivoConvertido.blob, nomeArquivo);
    formData.append('arquivos', arquivoPdf, nomeArquivo);
  });
  return formData;
}

tipoAtestado.addEventListener('change', atualizarCampoHoras);
dataInicio.addEventListener('input', () => normalizarDigitacaoData(dataInicio));
dataInicio.addEventListener('change', () => {
  validarDatasNaoFuturas();
  calcularFimPorDias();
  if (tipoAtestado.value !== 'Declaração') {
    calcularDiasPorIntervalo();
  }
  validarDatasNaoFuturas();
});
dias.addEventListener('input', () => {
  calcularFimPorDias();
  validarDatasNaoFuturas();
});

if (rhAccessBtn) {
  rhAccessBtn.addEventListener('click', () => {
    localStorage.setItem('rh_redirect_after_login', 'rh-atestados.html');
    registrarEventoBackend('clicou_botao_rh');
    window.location.href = 'account-selector.html';
  });
}



form.addEventListener('submit', async (event) => {
  event.preventDefault();
  definirEstadoEnvio(true);
  if (mensagem) {
    mensagem.textContent = '';
  }

  calcularFimPorDias();
  validarDatasNaoFuturas();

  if (!form.checkValidity()) {
    form.reportValidity();
    definirMensagemStatus('Revise os campos obrigatórios antes de enviar.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  if (!window.jspdf) {
    definirMensagemStatus('Falha ao carregar a biblioteca de PDF. Atualize a página.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  const listaArquivos = Array.from(arquivos.files || []);
  if (!listaArquivos.length) {
    definirMensagemStatus('Selecione pelo menos um arquivo para enviar.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  if (!window.storage || !window.db) {
    definirMensagemStatus('Firebase não inicializado. Atualize a página e tente novamente.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  if (!normalizarProjeto(projetoSelect?.value)) {
    definirMensagemStatus('Selecione o projeto antes de enviar o formulario.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  atualizarProgressoUpload(0, '0%');

  try {
    const resultadosConversao = await Promise.all(
      listaArquivos.map(async (arquivo) => ({
        arquivo,
        convertido: await converterArquivoParaPdf(arquivo)
      }))
    );

    const convertidos = resultadosConversao
      .filter((item) => !!item.convertido)
      .map((item) => item.convertido);

    const naoSuportados = resultadosConversao
      .filter((item) => !item.convertido)
      .map((item) => item.arquivo.name);

    if (naoSuportados.length) {
      ocultarProgressoUpload();
      definirMensagemStatus(`Arquivo(s) não suportado(s): ${naoSuportados.join(', ')}`, 'error');
      definirEstadoEnvio(false);
      return;
    }

    // Validar dias - se inválido, recalcular a partir das datas
    const dataInicioISO = displayParaISO(dataInicio.value);
    let dataFimISO = displayParaISO(dataFim.value);
    const isDeclaracao = tipoAtestado.value === 'Declaração';
    if (isDeclaracao) {
      dataFimISO = dataInicioISO;
      dataFim.value = dataInicio.value;
      dias.value = '1';
    }

    let diasEnvio = isDeclaracao ? 1 : (Number(dias.value) || 0);
    if (!Number.isInteger(diasEnvio) || diasEnvio < 1 || diasEnvio > 365) {
      if (dataInicioISO && dataFimISO) {
        const inicio = toUTCDate(dataInicioISO);
        const fim = toUTCDate(dataFimISO);
        diasEnvio = Math.floor((fim - inicio) / MS_POR_DIA) + 1;
      } else {
        throw new Error('Preencha as datas de início e fim para calcular os dias.');
      }
    }
    if (diasEnvio < 1 || diasEnvio > 365) {
      throw new Error('Os dias devem ser entre 1 e 365. Verifique as datas de início e fim.');
    }

    // Verifica se o usuário está autenticado antes de qualquer operação sensível
    // Fluxo público: o envio não depende de sessão Firebase Auth.

    atualizarProgressoUpload(5, '5%');

    // Upload dos arquivos para o Storage (paralelo)
    const nomePdfPadrao = montarNomePdfPadrao();
    const timestampBase = Date.now();
    const totalBytes = convertidos.reduce((total, convertido) => total + (Number(convertido?.blob?.size) || 0), 0);
    const bytesTransferidosPorArquivo = new Array(convertidos.length).fill(0);
    const arquivosPayload = await Promise.all(
      convertidos.map(async (convertido, indice) => {
        const nomeArquivo = convertidos.length > 1
          ? nomePdfPadrao.replace('.pdf', ` - ANEXO ${indice + 1}.pdf`)
          : nomePdfPadrao;

        const storageRef = window.storage.ref(`atestados/${timestampBase}_${indice + 1}_${nomeArquivo}`);
        const url = await uploadComProgresso(storageRef, convertido.blob, bytesTransferidosPorArquivo, indice, totalBytes, nomeArquivo);

        return {
          nome: nomeArquivo,
          tipo: 'application/pdf',
          url
        };
      })
    );

    // Salvar dados no Firestore
    const dadosEnvio = {
      nome: document.getElementById('nome').value.trim(),
      funcao: document.getElementById('funcao').value.trim(),
      projeto: projetoSelect.value,
      tipo_atestado: tipoAtestado.value,
      horas_comparecimento: horasInput.value ? String(Number(horasInput.value)) : '',
      data_inicio: dataInicioISO,
      data_fim: dataFimISO,
      dias: diasEnvio,
      arquivos: arquivosPayload,
      criado_em: new Date().toISOString()
    };
    await window.db.collection('envios_atestados').add(dadosEnvio);
    atualizarProgressoUpload(100, '100%');
    await registrarEventoBackend('envio_realizado', {
      projeto: dadosEnvio.projeto,
      tipo_atestado: dadosEnvio.tipo_atestado
    });
    window.location.href = 'sucesso.html';
  } catch (error) {
    console.error('Erro ao enviar atestado:', error);
    ocultarProgressoUpload();
    const textoErro = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    if (textoErro.includes('storage/unauthorized') || textoErro.includes('forbidden')) {
      definirMensagemStatus('Erro ao enviar: Firebase Storage bloqueou o upload. Publique as regras de Storage no Firebase Console.', 'error');
    } else {
      definirMensagemStatus(`Erro ao enviar: ${error?.message || 'Falha inesperada.'}`, 'error');
    }
    definirEstadoEnvio(false);
  }
});

atualizarCampoHoras();
validarDatasNaoFuturas();
registrarEventoBackend('acesso_pagina');
ocultarProgressoUpload();
inicializarGateProjeto();
atualizarLinkVoltarFormulario();
