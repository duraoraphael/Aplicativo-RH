const BACKEND_URL = (localStorage.getItem('rh_backend_url') || '').trim().replace(/\/+$/, '');

const dashboardStatus = document.getElementById('dashboardStatus');
const totalEnviosEl = document.getElementById('dashTotalEnvios');
const hojeEl = document.getElementById('dashHoje');
const semanaEl = document.getElementById('dashSemana');
const projetosAtivosEl = document.getElementById('dashProjetosAtivos');
const filtroProjetoInput = document.getElementById('filtroProjetoDemandas');
const filtroProjetoInfoEl = document.getElementById('filtroProjetoDemandasInfo');
const graficoProjetosEl = document.getElementById('graficoProjetos');

let todosRegistros = [];
let resumoProjetos = [];

function setDashboardStatus(texto, tipo = 'info') {
  if (!dashboardStatus) return;

  dashboardStatus.textContent = texto;
  dashboardStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    dashboardStatus.classList.add('status-message--error');
  } else if (tipo === 'success') {
    dashboardStatus.classList.add('status-message--success');
  } else {
    dashboardStatus.classList.add('status-message--info');
  }
}

function normalizarTextoBusca(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
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

function aplicarFiltroProjetoDashboard() {
  const termo = normalizarTextoBusca(filtroProjetoInput.value);

  const filtrados = !termo
    ? resumoProjetos
    : resumoProjetos.filter((item) => normalizarTextoBusca(item.projeto).includes(termo));

  renderizarGraficoProjetos(filtrados);

  if (!termo) {
    filtroProjetoInfoEl.textContent = 'Mostrando todos os projetos em andamento.';
  } else {
    filtroProjetoInfoEl.textContent = `Mostrando ${filtrados.length} de ${resumoProjetos.length} projeto(s).`;
  }
}

async function carregarDashboardDemandas() {
  setDashboardStatus('Carregando dashboard de demandas...', 'info');

  try {
    todosRegistros = await carregarEnviosComFallback();
    atualizarResumoGeral(todosRegistros);

    resumoProjetos = montarResumoProjetos(todosRegistros);
    aplicarFiltroProjetoDashboard();

    setDashboardStatus('Dashboard atualizado com sucesso.', 'success');
  } catch (error) {
    atualizarResumoGeral([]);
    resumoProjetos = [];
    renderizarGraficoProjetos([]);
    setDashboardStatus(`Erro ao carregar dashboard: ${error?.message || 'Falha ao buscar dados.'}`, 'error');
  }
}

if (filtroProjetoInput) {
  filtroProjetoInput.addEventListener('input', aplicarFiltroProjetoDashboard);
}

carregarDashboardDemandas();
