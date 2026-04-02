const DEFAULT_REMOTE_BACKEND_URL = '';

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

const dashboardStatus = document.getElementById('dashboardStatus');
const totalEnviosEl = document.getElementById('dashTotalEnvios');
const hojeEl = document.getElementById('dashHoje');
const semanaEl = document.getElementById('dashSemana');
const projetosAtivosEl = document.getElementById('dashProjetosAtivos');
const filtroCriterioBuscaDemandasEl = document.getElementById('filtroCriterioBuscaDemandas');
const filtroProjetoInput = document.getElementById('filtroProjetoDemandas');
const filtroProjetoSelectDemandasEl = document.getElementById('filtroProjetoSelectDemandas');
const filtroTipoDemandasEl = document.getElementById('filtroTipoDemandas');
const limparFiltrosDemandasBtn = document.getElementById('limparFiltrosDemandasBtn');
const filtroProjetoInfoEl = document.getElementById('filtroProjetoDemandasInfo');
const graficoProjetosEl = document.getElementById('graficoProjetos');
const graficoTiposAtestadoEl = document.getElementById('graficoTiposAtestado');
const legendaTiposAtestadoEl = document.getElementById('legendaTiposAtestado');
const tabProjetoBtn = document.getElementById('tabProjetoBtn');
const tabTipoBtn = document.getElementById('tabTipoBtn');
const painelGraficoProjetos = document.getElementById('painelGraficoProjetos');
const painelGraficoTipos = document.getElementById('painelGraficoTipos');

let todosRegistros = [];
let resumoProjetos = [];
let abaGraficoAtiva = 'projetos';
let dashboardStatusTimer = null;
let cancelMonitorAcessoRh = null;

const CLASSES_TIPO_ATESTADO = {
  medico: 'rh-chart-column-bar--medico',
  declaracao: 'rh-chart-column-bar--declaracao',
  odontologico: 'rh-chart-column-bar--odontologico',
  maternidade: 'rh-chart-column-bar--maternidade',
  outro: 'rh-chart-column-bar--outro'
};

function alternarAbaGrafico(aba) {
  const mostrarProjetos = aba === 'projetos';
  abaGraficoAtiva = mostrarProjetos ? 'projetos' : 'tipos';

  if (tabProjetoBtn) {
    tabProjetoBtn.classList.toggle('is-active', mostrarProjetos);
    tabProjetoBtn.setAttribute('aria-selected', mostrarProjetos ? 'true' : 'false');
  }
  if (tabTipoBtn) {
    tabTipoBtn.classList.toggle('is-active', !mostrarProjetos);
    tabTipoBtn.setAttribute('aria-selected', mostrarProjetos ? 'false' : 'true');
  }

  if (painelGraficoProjetos) {
    painelGraficoProjetos.classList.toggle('hidden', !mostrarProjetos);
    painelGraficoProjetos.classList.toggle('rh-chart-panel--active', mostrarProjetos);
  }
  if (painelGraficoTipos) {
    painelGraficoTipos.classList.toggle('hidden', mostrarProjetos);
    painelGraficoTipos.classList.toggle('rh-chart-panel--active', !mostrarProjetos);
  }

  atualizarUrlEstadoDashboard();
}

function obterEstadoDashboardDaUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    criterio: String(params.get('criterio') || '').trim(),
    busca: String(params.get('busca') || '').trim(),
    projeto: String(params.get('projeto') || '').trim(),
    tipo: String(params.get('tipo') || '').trim(),
    aba: String(params.get('aba') || '').trim()
  };
}

function restaurarEstadoDashboardDaUrl() {
  const estado = obterEstadoDashboardDaUrl();

  if (filtroCriterioBuscaDemandasEl && (estado.criterio === 'projeto' || estado.criterio === 'tipo')) {
    filtroCriterioBuscaDemandasEl.value = estado.criterio;
  }
  if (filtroProjetoInput && estado.busca) {
    filtroProjetoInput.value = estado.busca;
  }
  if (filtroProjetoSelectDemandasEl && estado.projeto) {
    filtroProjetoSelectDemandasEl.value = estado.projeto;
  }
  if (filtroTipoDemandasEl && estado.tipo) {
    filtroTipoDemandasEl.value = estado.tipo;
  }

  if (estado.aba === 'tipos') {
    alternarAbaGrafico('tipos');
  } else {
    alternarAbaGrafico('projetos');
  }

  atualizarPlaceholderBuscaDashboard();
}

function atualizarUrlEstadoDashboard() {
  const params = new URLSearchParams();

  const criterio = String(filtroCriterioBuscaDemandasEl?.value || 'projeto').trim();
  const busca = String(filtroProjetoInput?.value || '').trim();
  const projeto = String(filtroProjetoSelectDemandasEl?.value || '').trim();
  const tipo = String(filtroTipoDemandasEl?.value || '').trim();

  if (criterio && criterio !== 'projeto') {
    params.set('criterio', criterio);
  }
  if (busca) {
    params.set('busca', busca);
  }
  if (projeto) {
    params.set('projeto', projeto);
  }
  if (tipo) {
    params.set('tipo', tipo);
  }
  if (abaGraficoAtiva === 'tipos') {
    params.set('aba', 'tipos');
  }

  const novaUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState({}, '', novaUrl);
}

function setDashboardStatus(texto, tipo = 'info') {
  if (!dashboardStatus) return;

  if (dashboardStatusTimer) {
    clearTimeout(dashboardStatusTimer);
    dashboardStatusTimer = null;
  }

  dashboardStatus.textContent = texto;
  dashboardStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    dashboardStatus.classList.add('status-message--error');
  } else if (tipo === 'success') {
    dashboardStatus.classList.add('status-message--success');
  } else {
    dashboardStatus.classList.add('status-message--info');
  }

  if (tipo === 'success' || tipo === 'info') {
    dashboardStatusTimer = setTimeout(() => {
      if (!dashboardStatus) return;
      dashboardStatus.textContent = '';
      dashboardStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
      dashboardStatusTimer = null;
    }, 4000);
  }
}

function normalizarTextoBusca(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function atualizarPlaceholderBuscaDashboard() {
  if (!filtroProjetoInput) return;
  const criterio = String(filtroCriterioBuscaDemandasEl?.value || 'projeto').trim();
  filtroProjetoInput.placeholder = criterio === 'tipo'
    ? 'Digite o tipo de atestado'
    : 'Digite codigo ou nome do projeto';
}

function erroPermissaoFirestore(error) {
  const texto = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return texto.includes('permission-denied') || texto.includes('missing or insufficient permissions');
}

function obterBackendConfigurado() {
  return BACKEND_URL;
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
    // Sem monitoramento em caso de falha de permissao/rede.
  }
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

    const backendBase = obterBackendConfigurado();
    if (!backendBase) {
      throw new Error('Sem permissao no Firestore para ler envios_atestados e backend nao configurado.');
    }

    const dados = await requisicaoBackendJson(`${backendBase}/api/envios?limit=1000`);
    return Array.isArray(dados) ? dados : [];
  }
}

function atualizarResumoGeral(registros) {
  const lista = Array.isArray(registros) ? registros : [];
  const agora = new Date();
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const limiteSemana = agora.getTime() - (7 * 24 * 60 * 60 * 1000);

  const enviadosHoje = lista.filter((registro) => {
    const ts = new Date(registro?.criado_em || '').getTime();
    return Number.isFinite(ts) && ts >= inicioHoje;
  }).length;

  const enviadosSemana = lista.filter((registro) => {
    const ts = new Date(registro?.criado_em || '').getTime();
    return Number.isFinite(ts) && ts >= limiteSemana;
  }).length;

  const projetosAtivos = new Set(
    lista.map((registro) => String(registro?.projeto || '').trim()).filter(Boolean)
  ).size;

  totalEnviosEl.textContent = String(lista.length);
  hojeEl.textContent = String(enviadosHoje);
  semanaEl.textContent = String(enviadosSemana);
  projetosAtivosEl.textContent = String(projetosAtivos);
}

function montarResumoProjetos(registros) {
  const mapa = new Map();

  registros.forEach((registro) => {
    const projeto = String(registro?.projeto || '').trim() || 'Projeto nao informado';
    const atual = mapa.get(projeto) || { projeto, total: 0 };
    atual.total += 1;
    mapa.set(projeto, atual);
  });

  return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
}

function preencherFiltroTipoDemandas(registros) {
  if (!filtroTipoDemandasEl) return;

  const tipoAtual = String(filtroTipoDemandasEl.value || '').trim();

  const tiposUnicos = [...new Set(registros
    .map((registro) => String(registro?.tipo_atestado || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  filtroTipoDemandasEl.innerHTML = '<option value="">Todos os tipos</option>';
  tiposUnicos.forEach((tipo) => {
    const option = document.createElement('option');
    option.value = tipo;
    option.textContent = tipo;
    filtroTipoDemandasEl.appendChild(option);
  });

  const optionExiste = Array.from(filtroTipoDemandasEl.options).some((opt) => opt.value === tipoAtual);
  if (optionExiste) {
    filtroTipoDemandasEl.value = tipoAtual;
  }
}

function preencherFiltroProjetoDemandas(registros) {
  if (!filtroProjetoSelectDemandasEl) return;

  const projetoSelecionadoAtual = String(filtroProjetoSelectDemandasEl.value || '').trim();
  const projetosUnicos = [...new Set(registros
    .map((registro) => String(registro?.projeto || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  filtroProjetoSelectDemandasEl.innerHTML = '<option value="">Todos os projetos</option>';
  projetosUnicos.forEach((projeto) => {
    const option = document.createElement('option');
    option.value = projeto;
    option.textContent = projeto;
    filtroProjetoSelectDemandasEl.appendChild(option);
  });

  const optionExiste = Array.from(filtroProjetoSelectDemandasEl.options).some((opt) => opt.value === projetoSelecionadoAtual);
  if (optionExiste) {
    filtroProjetoSelectDemandasEl.value = projetoSelecionadoAtual;
  }
}

function montarResumoTiposAtestado(registros) {
  const mapa = new Map();

  registros.forEach((registro) => {
    const tipo = String(registro?.tipo_atestado || '').trim() || 'Tipo nao informado';
    const atual = mapa.get(tipo) || { tipo, total: 0 };
    atual.total += 1;
    mapa.set(tipo, atual);
  });

  return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
}

function chaveTipoAtestado(tipo) {
  const normalizado = normalizarTextoBusca(tipo);
  if (normalizado.includes('declaracao')) return 'declaracao';
  if (normalizado.includes('odontologico')) return 'odontologico';
  if (normalizado.includes('maternidade')) return 'maternidade';
  if (normalizado.includes('medico')) return 'medico';
  return 'outro';
}

function renderizarLegendaTiposAtestado(listaTipos) {
  if (!legendaTiposAtestadoEl) return;

  legendaTiposAtestadoEl.innerHTML = '';
  if (!listaTipos.length) return;

  const tiposUnicos = [...new Set(listaTipos.map((item) => String(item.tipo || '').trim()).filter(Boolean))];

  tiposUnicos.forEach((tipo) => {
    const chave = chaveTipoAtestado(tipo);

    const chip = document.createElement('span');
    chip.className = 'rh-chart-legend-item';

    const cor = document.createElement('i');
    cor.className = `rh-chart-legend-dot ${CLASSES_TIPO_ATESTADO[chave] || CLASSES_TIPO_ATESTADO.outro}`;

    const texto = document.createElement('strong');
    texto.textContent = tipo;

    chip.appendChild(cor);
    chip.appendChild(texto);
    legendaTiposAtestadoEl.appendChild(chip);
  });
}

function renderizarGraficoProjetos(listaProjetos) {
  graficoProjetosEl.innerHTML = '';

  if (!listaProjetos.length) {
    graficoProjetosEl.innerHTML = '<p class="rh-project-search-info">Nenhum projeto encontrado para o filtro atual.</p>';
    return;
  }

  const max = Math.max(...listaProjetos.map((item) => item.total), 1);
  const colunas = document.createElement('div');
  colunas.className = 'rh-chart-columns';

  listaProjetos.forEach((item) => {
    const coluna = document.createElement('article');
    coluna.className = 'rh-chart-column';

    const barraArea = document.createElement('div');
    barraArea.className = 'rh-chart-column-wrap';

    const barra = document.createElement('div');
    barra.className = 'rh-chart-column-bar';
    barra.style.height = `${Math.max(12, Math.round((item.total / max) * 100))}%`;
    barra.title = `${item.projeto}: ${item.total}`;

    const valor = document.createElement('span');
    valor.className = 'rh-chart-column-value';
    valor.textContent = String(item.total);

    const label = document.createElement('div');
    label.className = 'rh-chart-column-label';
    label.textContent = item.projeto;
    label.title = item.projeto;

    barra.appendChild(valor);
    barraArea.appendChild(barra);
    coluna.appendChild(barraArea);
    coluna.appendChild(label);
    colunas.appendChild(coluna);
  });

  graficoProjetosEl.appendChild(colunas);
}

function renderizarGraficoTiposAtestado(listaTipos) {
  if (!graficoTiposAtestadoEl) return;

  graficoTiposAtestadoEl.innerHTML = '';
  renderizarLegendaTiposAtestado(listaTipos);

  if (!listaTipos.length) {
    graficoTiposAtestadoEl.innerHTML = '<p class="rh-project-search-info">Nenhum tipo encontrado para o filtro atual.</p>';
    return;
  }

  const max = Math.max(...listaTipos.map((item) => item.total), 1);
  const colunas = document.createElement('div');
  colunas.className = 'rh-chart-columns';

  listaTipos.forEach((item) => {
    const coluna = document.createElement('article');
    coluna.className = 'rh-chart-column';

    const barraArea = document.createElement('div');
    barraArea.className = 'rh-chart-column-wrap';

    const barra = document.createElement('div');
    const chave = chaveTipoAtestado(item.tipo);
    barra.className = `rh-chart-column-bar ${CLASSES_TIPO_ATESTADO[chave] || CLASSES_TIPO_ATESTADO.outro}`;
    barra.style.height = `${Math.max(12, Math.round((item.total / max) * 100))}%`;
    barra.title = `${item.tipo}: ${item.total}`;

    const valor = document.createElement('span');
    valor.className = 'rh-chart-column-value';
    valor.textContent = String(item.total);

    const label = document.createElement('div');
    label.className = 'rh-chart-column-label';
    label.textContent = item.tipo;
    label.title = item.tipo;

    barra.appendChild(valor);
    barraArea.appendChild(barra);
    coluna.appendChild(barraArea);
    coluna.appendChild(label);
    colunas.appendChild(coluna);
  });

  graficoTiposAtestadoEl.appendChild(colunas);
}

function aplicarFiltroProjetoDashboard() {
  const termo = normalizarTextoBusca(filtroProjetoInput.value);
  const criterioBusca = String(filtroCriterioBuscaDemandasEl?.value || 'projeto').trim();
  const projetoSelecionado = String(filtroProjetoSelectDemandasEl?.value || '').trim();
  const tipoSelecionado = String(filtroTipoDemandasEl?.value || '').trim();

  const registrosFiltradosBase = todosRegistros.filter((registro) => {
    const projetoRegistro = String(registro?.projeto || '').trim();
    const tipoRegistro = String(registro?.tipo_atestado || '').trim();

    const correspondeProjetoSelecionado = !projetoSelecionado || projetoRegistro === projetoSelecionado;
    const correspondeTipoSelecionado = !tipoSelecionado || tipoRegistro === tipoSelecionado;

    return correspondeProjetoSelecionado && correspondeTipoSelecionado;
  });

  const registrosComBusca = !termo
    ? registrosFiltradosBase
    : registrosFiltradosBase.filter((registro) => {
      const projetoRegistro = normalizarTextoBusca(registro?.projeto);
      const tipoRegistro = normalizarTextoBusca(registro?.tipo_atestado);
      return criterioBusca === 'tipo'
        ? tipoRegistro.includes(termo)
        : projetoRegistro.includes(termo);
    });

  const resumoBase = montarResumoProjetos(registrosComBusca);
  const filtrados = resumoBase;

  renderizarGraficoProjetos(filtrados);

  const registrosFiltrados = registrosComBusca;
  const resumoTipos = montarResumoTiposAtestado(registrosFiltrados);
  renderizarGraficoTiposAtestado(resumoTipos);

  if (!termo) {
    if (projetoSelecionado && tipoSelecionado) {
      filtroProjetoInfoEl.textContent = `Mostrando projeto "${projetoSelecionado}" no tipo "${tipoSelecionado}".`;
    } else if (projetoSelecionado) {
      filtroProjetoInfoEl.textContent = `Mostrando projeto "${projetoSelecionado}".`;
    } else if (tipoSelecionado) {
      filtroProjetoInfoEl.textContent = `Mostrando todos os projetos para o tipo "${tipoSelecionado}".`;
    } else {
      filtroProjetoInfoEl.textContent = 'Mostrando todos os projetos em andamento.';
    }
  } else {
    const alvo = criterioBusca === 'tipo' ? 'tipo(s)' : 'projeto(s)';
    filtroProjetoInfoEl.textContent = `Busca por ${alvo}: ${resumoBase.length} resultado(s).`;
  }

  atualizarUrlEstadoDashboard();
}

function limparFiltrosDashboard() {
  if (filtroProjetoInput) {
    filtroProjetoInput.value = '';
  }
  if (filtroProjetoSelectDemandasEl) {
    filtroProjetoSelectDemandasEl.value = '';
  }
  if (filtroTipoDemandasEl) {
    filtroTipoDemandasEl.value = '';
  }

  aplicarFiltroProjetoDashboard();
}

async function carregarDashboardDemandas() {
  setDashboardStatus('Carregando dashboard de demandas...', 'info');

  try {
    todosRegistros = await carregarEnviosComFallback();
    atualizarResumoGeral(todosRegistros);

    resumoProjetos = montarResumoProjetos(todosRegistros);
    preencherFiltroProjetoDemandas(todosRegistros);
    preencherFiltroTipoDemandas(todosRegistros);
    restaurarEstadoDashboardDaUrl();
    aplicarFiltroProjetoDashboard();

    setDashboardStatus('Dashboard atualizado com sucesso.', 'success');
  } catch (error) {
    atualizarResumoGeral([]);
    resumoProjetos = [];
    renderizarGraficoProjetos([]);
    renderizarGraficoTiposAtestado([]);
    setDashboardStatus(`Erro ao carregar dashboard: ${error?.message || 'Falha ao buscar dados.'}`, 'error');
  }
}

if (filtroProjetoInput) {
  filtroProjetoInput.addEventListener('input', aplicarFiltroProjetoDashboard);
}

if (filtroCriterioBuscaDemandasEl) {
  filtroCriterioBuscaDemandasEl.addEventListener('change', () => {
    atualizarPlaceholderBuscaDashboard();
    aplicarFiltroProjetoDashboard();
  });
}

if (filtroProjetoSelectDemandasEl) {
  filtroProjetoSelectDemandasEl.addEventListener('change', aplicarFiltroProjetoDashboard);
}

if (filtroTipoDemandasEl) {
  filtroTipoDemandasEl.addEventListener('change', aplicarFiltroProjetoDashboard);
}

if (limparFiltrosDemandasBtn) {
  limparFiltrosDemandasBtn.addEventListener('click', limparFiltrosDashboard);
}

if (tabProjetoBtn) {
  tabProjetoBtn.addEventListener('click', () => alternarAbaGrafico('projetos'));
}

if (tabTipoBtn) {
  tabTipoBtn.addEventListener('click', () => alternarAbaGrafico('tipos'));
}
restaurarEstadoDashboardDaUrl();
atualizarPlaceholderBuscaDashboard();
iniciarMonitoramentoAcessoRh();

carregarDashboardDemandas();
