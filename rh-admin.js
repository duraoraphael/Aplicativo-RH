//const BACKEND_URL = '';

let usuarioLogado = null;
let adminMensagemTimer = null;
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
const usuariosCadastradosStatus = document.getElementById('usuariosCadastradosStatus');
const listaUsuariosCadastrados = document.getElementById('listaUsuariosCadastrados');
const painelColaboradoresConteudo = document.getElementById('painelColaboradoresConteudo');
const togglePainelColaboradoresBtn = document.getElementById('togglePainelColaboradoresBtn');
const buscaUsuariosCadastrados = document.getElementById('buscaUsuariosCadastrados');
const filtroStatusUsuariosCadastrados = document.getElementById('filtroStatusUsuariosCadastrados');
const atualizarUsuariosCadastradosBtn = document.getElementById('atualizarUsuariosCadastradosBtn');
const toggleUsuariosCadastradosBtn = document.getElementById('toggleUsuariosCadastradosBtn');
const resumoUsuariosTotal = document.getElementById('resumoUsuariosTotal');
const resumoUsuariosAprovados = document.getElementById('resumoUsuariosAprovados');
const resumoUsuariosPendentes = document.getElementById('resumoUsuariosPendentes');
const resumoUsuariosRejeitados = document.getElementById('resumoUsuariosRejeitados');
let usuariosCadastradosCache = [];
let mostrarTodosUsuariosCadastrados = false;
const PREVIEW_USUARIOS_CADASTRADOS = 6;
let painelColaboradoresAberto = false;
let colaboradoresCarregados = false;
let cancelMonitorAcessoRh = null;
const adminDialogState = {
  aberto: false,
  usaInput: false,
  resolver: null
};

function resolverDialogoAdmin(confirmado) {
  if (!adminDialogState.aberto || typeof adminDialogState.resolver !== 'function') {
    return;
  }

  const inputEl = document.getElementById('adminDialogInput');
  const valor = adminDialogState.usaInput ? String(inputEl ? inputEl.value : '') : '';
  const resolve = adminDialogState.resolver;
  fecharDialogoAdmin();
  resolve({ confirmado: !!confirmado, valor: confirmado ? valor : '' });
}

window.__adminDialogConfirm = () => resolverDialogoAdmin(true);
window.__adminDialogCancel = () => resolverDialogoAdmin(false);

function garantirDialogoAdmin() {
  let overlay = document.getElementById('adminDialogOverlay');
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = 'adminDialogOverlay';
  overlay.className = 'admin-dialog-overlay hidden';
  overlay.innerHTML = `
    <div class="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="adminDialogTitle">
      <h3 id="adminDialogTitle" class="admin-dialog-title"></h3>
      <p id="adminDialogMessage" class="admin-dialog-message"></p>
      <label id="adminDialogInputWrap" class="admin-dialog-input-wrap hidden" for="adminDialogInput">
        <span id="adminDialogInputLabel">Valor</span>
        <input id="adminDialogInput" type="text" autocomplete="off" />
      </label>
      <div class="admin-dialog-actions">
        <button id="adminDialogCancelBtn" type="button" class="btn-rejeitar" onclick="window.__adminDialogCancel && window.__adminDialogCancel()">Cancelar</button>
        <button id="adminDialogConfirmBtn" type="button" class="btn-aprovar" onclick="window.__adminDialogConfirm && window.__adminDialogConfirm()">Confirmar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      resolverDialogoAdmin(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!adminDialogState.aberto) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      resolverDialogoAdmin(false);
      return;
    }

    if (event.key === 'Enter' && adminDialogState.usaInput) {
      event.preventDefault();
      resolverDialogoAdmin(true);
    }
  });

  return overlay;
}

function fecharDialogoAdmin() {
  const overlay = garantirDialogoAdmin();

  overlay.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  adminDialogState.aberto = false;
  adminDialogState.usaInput = false;
  adminDialogState.resolver = null;
}

function abrirDialogoAdmin(config) {
  const {
    titulo,
    mensagem,
    modo = 'confirm',
    inputLabel = 'Valor',
    placeholder = '',
    valorInicial = '',
    textoConfirmar = 'Confirmar',
    textoCancelar = 'Cancelar'
  } = config;

  const overlay = garantirDialogoAdmin();
  const titleEl = document.getElementById('adminDialogTitle');
  const messageEl = document.getElementById('adminDialogMessage');
  const inputWrap = document.getElementById('adminDialogInputWrap');
  const inputLabelEl = document.getElementById('adminDialogInputLabel');
  const inputEl = document.getElementById('adminDialogInput');
  const cancelBtn = document.getElementById('adminDialogCancelBtn');
  const confirmBtn = document.getElementById('adminDialogConfirmBtn');

  titleEl.textContent = titulo || 'Confirmação';
  messageEl.textContent = mensagem || '';
  cancelBtn.textContent = textoCancelar;
  confirmBtn.textContent = textoConfirmar;

  const usaInput = modo === 'prompt';
  adminDialogState.usaInput = usaInput;
  inputWrap.classList.toggle('hidden', !usaInput);
  if (usaInput) {
    inputLabelEl.textContent = inputLabel;
    inputEl.value = String(valorInicial || '');
    inputEl.placeholder = placeholder;
  }

  return new Promise((resolve) => {
    adminDialogState.resolver = resolve;
    adminDialogState.aberto = true;

    overlay.classList.remove('hidden');
    document.body.classList.add('dialog-open');

    setTimeout(() => {
      if (usaInput) {
        inputEl.focus();
        inputEl.select();
      } else {
        confirmBtn.focus();
      }
    }, 10);
  });
}

function obterTokenArmazenado() {
  return localStorage.getItem('rh_auth_token');
}

function obterEmailArmazenado() {
  return localStorage.getItem('rh_user_email');
}

function obterNomeArmazenado() {
  return localStorage.getItem('rh_user_nome');
}

function definirMensagem(texto, tipo = 'loading') {
  const msgDiv = document.getElementById('mensagem');
  if (adminMensagemTimer) {
    clearTimeout(adminMensagemTimer);
    adminMensagemTimer = null;
  }

  msgDiv.textContent = texto;
  msgDiv.className = 'status-message status-toast';
  msgDiv.classList.add(tipo === 'error' ? 'status-message--error' : tipo === 'success' ? 'status-message--success' : 'status-message--info');
  msgDiv.classList.remove('hidden');

  if (tipo === 'success' || tipo === 'info') {
    adminMensagemTimer = setTimeout(() => {
      msgDiv.textContent = '';
      msgDiv.className = 'status-message status-toast hidden';
      adminMensagemTimer = null;
    }, 4000);
  }
}

function setUsuariosCadastradosStatus(texto, tipo = 'info') {
  if (!usuariosCadastradosStatus) return;

  usuariosCadastradosStatus.textContent = texto;
  usuariosCadastradosStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  usuariosCadastradosStatus.classList.add(tipo === 'error' ? 'status-message--error' : tipo === 'success' ? 'status-message--success' : 'status-message--info');
}

function normalizarTextoBusca(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function obterStatusUsuario(usuario) {
  const statusCampo = String(usuario?.status || '').trim().toLowerCase();
  if (statusCampo === 'aprovado' || statusCampo === 'pendente' || statusCampo === 'rejeitado') {
    return statusCampo;
  }

  if (usuario?.aprovado === true) {
    return 'aprovado';
  }

  return 'pendente';
}

function statusUsuarioLabel(status) {
  if (status === 'aprovado') return 'Aprovado';
  if (status === 'rejeitado') return 'Rejeitado';
  return 'Pendente';
}

function prioridadeStatusUsuario(status) {
  if (status === 'pendente') return 0;
  if (status === 'aprovado') return 1;
  if (status === 'rejeitado') return 2;
  return 3;
}

function atualizarResumoUsuariosCadastrados(listaBase, listaFiltrada) {
  if (resumoUsuariosTotal) {
    resumoUsuariosTotal.textContent = String(listaFiltrada.length);
  }

  const contar = (statusAlvo) => listaFiltrada.filter((usuario) => obterStatusUsuario(usuario) === statusAlvo).length;

  if (resumoUsuariosAprovados) {
    resumoUsuariosAprovados.textContent = String(contar('aprovado'));
  }
  if (resumoUsuariosPendentes) {
    resumoUsuariosPendentes.textContent = String(contar('pendente'));
  }
  if (resumoUsuariosRejeitados) {
    resumoUsuariosRejeitados.textContent = String(contar('rejeitado'));
  }

  if (!listaBase.length && resumoUsuariosTotal) {
    resumoUsuariosTotal.textContent = '0';
  }
}

function criarCardUsuarioCadastrado(usuario) {
  const status = obterStatusUsuario(usuario);
  const usuarioId = String(usuario?.id || '');
  const nomeSeguro = String(usuario?.nome || 'Sem nome').replace(/'/g, "\\'");
  const emailSeguro = String(usuario?.email || '').replace(/'/g, "\\'");
  const criadoEm = usuario?.criado_em ? new Date(usuario.criado_em) : null;
  const criadoEmTexto = criadoEm && !Number.isNaN(criadoEm.getTime())
    ? `${criadoEm.toLocaleDateString('pt-BR')} ${criadoEm.toLocaleTimeString('pt-BR')}`
    : '-';

  const div = document.createElement('article');
  div.className = 'usuario-item';
  div.innerHTML = `
    <div class="usuario-info">
      <div class="usuario-nome">${usuario?.nome || 'Sem nome'}</div>
      <div class="usuario-email">${usuario?.email || '-'}</div>
      <div class="usuario-data">Cadastrado em: ${criadoEmTexto}</div>
      <span class="usuario-status-chip usuario-status-chip--${status}">${statusUsuarioLabel(status)}</span>
    </div>
    <div class="usuario-acoes">
      <button type="button" class="btn-rejeitar" onclick="excluirColaborador('${usuarioId}', '${nomeSeguro}', '${emailSeguro}')">Excluir</button>
    </div>
  `;

  return div;
}

async function excluirColaborador(usuarioId, usuarioNome, usuarioEmail) {
  const confirmar = await abrirDialogoAdmin({
    titulo: 'Excluir colaborador',
    mensagem: `Confirma excluir ${usuarioNome} (${usuarioEmail})? O acesso será revogado imediatamente.`,
    modo: 'confirm',
    textoConfirmar: 'Excluir'
  });

  if (!confirmar.confirmado) {
    return;
  }

  definirMensagem('Excluindo colaborador...', 'loading');

  try {
    await window.firebase.firestore().collection('usuarios_rh').doc(String(usuarioId)).delete();
  } catch (erroFirestore) {
    if (!erroPermissaoFirestore(erroFirestore)) {
      definirMensagem(`❌ Erro ao excluir colaborador: ${erroFirestore.message}`, 'error');
      return;
    }

    try {
      await requisicaoBackendJson(`/api/usuarios/rejeitar/${encodeURIComponent(String(usuarioId))}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (erroBackend) {
      definirMensagem(`❌ Erro ao excluir colaborador: ${erroBackend.message}`, 'error');
      return;
    }
  }

  definirMensagem(`✅ ${usuarioNome} foi excluído e terá acesso revogado.`, 'success');
  await carregarUsuariosPendentes();
  await carregarUsuariosCadastrados();
}

function aplicarFiltrosUsuariosCadastrados() {
  if (!listaUsuariosCadastrados) return;

  const termo = normalizarTextoBusca(buscaUsuariosCadastrados?.value || '');
  const statusFiltro = String(filtroStatusUsuariosCadastrados?.value || '').trim().toLowerCase();

  const filtrados = usuariosCadastradosCache.filter((usuario) => {
    const nome = normalizarTextoBusca(usuario?.nome);
    const email = normalizarTextoBusca(usuario?.email);
    const status = obterStatusUsuario(usuario);

    const correspondeTexto = !termo || nome.includes(termo) || email.includes(termo);
    const correspondeStatus = !statusFiltro || status === statusFiltro;
    return correspondeTexto && correspondeStatus;
  }).sort((a, b) => {
    const statusA = obterStatusUsuario(a);
    const statusB = obterStatusUsuario(b);
    const prioridade = prioridadeStatusUsuario(statusA) - prioridadeStatusUsuario(statusB);
    if (prioridade !== 0) return prioridade;
    return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR');
  });

  atualizarResumoUsuariosCadastrados(usuariosCadastradosCache, filtrados);

  listaUsuariosCadastrados.innerHTML = '';
  if (!filtrados.length) {
    listaUsuariosCadastrados.innerHTML = '<div class="status-vazio">Nenhum colaborador encontrado para os filtros atuais</div>';
    setUsuariosCadastradosStatus('Nenhum colaborador encontrado para os filtros atuais.', 'info');
    if (toggleUsuariosCadastradosBtn) {
      toggleUsuariosCadastradosBtn.classList.add('hidden');
    }
    return;
  }

  const temFiltroAtivo = Boolean(termo || statusFiltro);
  const deveMostrarTodos = mostrarTodosUsuariosCadastrados || temFiltroAtivo;
  const listaRender = deveMostrarTodos ? filtrados : filtrados.slice(0, PREVIEW_USUARIOS_CADASTRADOS);

  if (toggleUsuariosCadastradosBtn) {
    const precisaToggle = !temFiltroAtivo && filtrados.length > PREVIEW_USUARIOS_CADASTRADOS;
    toggleUsuariosCadastradosBtn.classList.toggle('hidden', !precisaToggle);
    if (precisaToggle) {
      toggleUsuariosCadastradosBtn.textContent = mostrarTodosUsuariosCadastrados ? 'Mostrar menos' : 'Mostrar todos';
    }
  }

  listaRender.forEach((usuario) => {
    listaUsuariosCadastrados.appendChild(criarCardUsuarioCadastrado(usuario));
  });

  if (!deveMostrarTodos && filtrados.length > PREVIEW_USUARIOS_CADASTRADOS) {
    setUsuariosCadastradosStatus(`Mostrando ${listaRender.length} de ${filtrados.length} colaborador(es). Clique em "Mostrar todos" para expandir.`, 'success');
    return;
  }

  setUsuariosCadastradosStatus(`Mostrando ${listaRender.length} de ${usuariosCadastradosCache.length} colaborador(es).`, 'success');
}

async function carregarUsuariosCadastrados() {
  if (!listaUsuariosCadastrados) return;
  setUsuariosCadastradosStatus('Carregando colaboradores cadastrados...', 'info');

  try {
    const snap = await window.firebase.firestore().collection('usuarios_rh').orderBy('criado_em', 'desc').get();
    usuariosCadastradosCache = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    aplicarFiltrosUsuariosCadastrados();
  } catch (error) {
    usuariosCadastradosCache = [];
    atualizarResumoUsuariosCadastrados([], []);
    listaUsuariosCadastrados.innerHTML = '<div class="status-vazio">Não foi possível carregar colaboradores cadastrados</div>';
    setUsuariosCadastradosStatus(`Erro ao carregar colaboradores: ${error?.message || 'Falha ao consultar base.'}`, 'error');
  }
}

async function alternarPainelColaboradores() {
  if (!painelColaboradoresConteudo || !togglePainelColaboradoresBtn) {
    return;
  }

  painelColaboradoresAberto = !painelColaboradoresAberto;
  painelColaboradoresConteudo.classList.toggle('hidden', !painelColaboradoresAberto);
  painelColaboradoresConteudo.setAttribute('aria-hidden', painelColaboradoresAberto ? 'false' : 'true');
  togglePainelColaboradoresBtn.textContent = painelColaboradoresAberto ? 'Ocultar colaboradores' : 'Mostrar colaboradores';

  if (painelColaboradoresAberto && !colaboradoresCarregados) {
    await carregarUsuariosCadastrados();
    colaboradoresCarregados = true;
  }
}

function voltarParaPainel() {
  window.location.href = 'rh-atestados.html';
}

function validarEmailBasico(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizarNomePorEmail(email) {
  const local = String(email || '').split('@')[0] || 'Usuário RH';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Usuário RH';
}

function obterCamposPainelSincronizacao() {
  return {
    panel: document.getElementById('sincronizarUsuarioPanel'),
    emailInput: document.getElementById('syncUsuarioEmail'),
    nomeInput: document.getElementById('syncUsuarioNome')
  };
}

function sincronizarUsuarioPorEmail() {
  const { panel, emailInput, nomeInput } = obterCamposPainelSincronizacao();
  if (!panel || !emailInput || !nomeInput) {
    definirMensagem('Não foi possível abrir o painel de sincronização.', 'error');
    return;
  }

  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  emailInput.value = '';
  nomeInput.value = '';
  setTimeout(() => emailInput.focus(), 10);
}

function cancelarSincronizacaoUsuario() {
  const { panel, emailInput, nomeInput } = obterCamposPainelSincronizacao();
  if (panel) {
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }
  if (emailInput) {
    emailInput.value = '';
  }
  if (nomeInput) {
    nomeInput.value = '';
  }
  definirMensagem('Sincronização cancelada.', 'info');
}

async function confirmarSincronizacaoUsuario() {
  const { panel, emailInput, nomeInput } = obterCamposPainelSincronizacao();
  const email = String(emailInput?.value || '').trim().toLowerCase();
  if (!email) {
    definirMensagem('Informe o e-mail da colaboradora.', 'error');
    emailInput?.focus();
    return;
  }

  if (!validarEmailBasico(email)) {
    definirMensagem('E-mail inválido. Verifique e tente novamente.', 'error');
    emailInput?.focus();
    return;
  }

  const nome = String(nomeInput?.value || '').trim() || normalizarNomePorEmail(email);

  definirMensagem('Sincronizando usuário na fila de aprovação...', 'loading');

  try {
    const query = await window.firebase.firestore().collection('usuarios_rh').where('email', '==', email).limit(1).get();
    if (!query.empty) {
      const doc = query.docs[0];
      const atual = doc.data() || {};
      const statusAtual = String(atual.status || '').toLowerCase();
      const aprovadoAtual = atual.aprovado === true || statusAtual === 'aprovado';

      if (aprovadoAtual) {
        definirMensagem('Usuário já está aprovado. Nenhuma alteração foi necessária.', 'info');
      } else {
        await doc.ref.set({
          email,
          nome,
          status: 'pendente',
          aprovado: false,
          atualizado_em: new Date().toISOString()
        }, { merge: true });
        definirMensagem('Usuário sincronizado e marcado como pendente de aprovação.', 'success');
      }
    } else {
      await window.firebase.firestore().collection('usuarios_rh').add({
        email,
        nome,
        status: 'pendente',
        aprovado: false,
        criado_em: new Date().toISOString()
      });
      definirMensagem('Usuário criado na fila de aprovação com sucesso.', 'success');
    }

    setTimeout(() => {
      carregarUsuariosPendentes();
    }, 600);
    if (panel) {
      panel.classList.add('hidden');
      panel.setAttribute('aria-hidden', 'true');
    }
    return;
  } catch (error) {
    if (!erroPermissaoFirestore(error)) {
      definirMensagem(`❌ Falha na sincronização: ${error.message}`, 'error');
      return;
    }
  }

  try {
    const cadastro = await requisicaoBackendJson('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, nome })
    });

    const status = String(cadastro?.status || 'pendente').toLowerCase();
    if (status === 'aprovado') {
      definirMensagem('Usuário já estava aprovado no sistema.', 'info');
    } else {
      definirMensagem('Usuário sincronizado via backend e marcado como pendente.', 'success');
    }

    setTimeout(() => {
      carregarUsuariosPendentes();
    }, 600);
  } catch (erroBackend) {
    definirMensagem(`❌ Falha na sincronização (Firestore e backend): ${erroBackend.message}`, 'error');
    return;
  }

  if (panel) {
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }
}

window.sincronizarUsuarioPorEmail = sincronizarUsuarioPorEmail;
window.confirmarSincronizacaoUsuario = confirmarSincronizacaoUsuario;
window.cancelarSincronizacaoUsuario = cancelarSincronizacaoUsuario;
window.excluirColaborador = excluirColaborador;

function verificarAutenticacao() {
  const token = obterTokenArmazenado();
  const email = obterEmailArmazenado();
  
  if (!token || !email) {
    window.location.href = 'rh-login.html';
    return false;
  }
  
  usuarioLogado = { token, email };
  return true;
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
  const email = String(obterEmailArmazenado() || '').trim().toLowerCase();
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
      });
  } catch {
    // Sem monitoramento em caso de falha de permissao/rede.
  }
}

function erroPermissaoFirestore(error) {
  const texto = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return texto.includes('permission-denied') || texto.includes('missing or insufficient permissions');
}

async function requisicaoBackendJson(path, options = {}, tentativas = 2) {
  if (!BACKEND_URL) {
    throw new Error('BACKEND_URL_NOT_CONFIGURED');
  }

  let ultimaResposta = null;
  const endpoint = `${BACKEND_URL}${path}`;

  for (let i = 0; i <= tentativas; i += 1) {
    let resposta;
    try {
      resposta = await fetch(endpoint, options);
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

function renderizarListaPendentes(docsPendentes) {
  const totalPendentes = document.getElementById('totalPendentes');
  totalPendentes.textContent = docsPendentes.length;

  const listaPendentes = document.getElementById('listaPendentes');
  if (!docsPendentes.length) {
    listaPendentes.innerHTML = '<div class="status-vazio">Nenhum usuário pendente de aprovação</div>';
    return;
  }

  listaPendentes.innerHTML = '';
  docsPendentes.forEach((item) => {
    const usuario = item.usuario;
    const usuarioId = item.id;
    const nomeSeguro = String(usuario?.nome || 'Usuário sem nome').replace(/'/g, "\\'");
    const criadoEm = usuario?.criado_em ? new Date(usuario.criado_em) : null;
    const criadoEmTexto = criadoEm && !Number.isNaN(criadoEm.getTime())
      ? `${criadoEm.toLocaleDateString('pt-BR')} ${criadoEm.toLocaleTimeString('pt-BR')}`
      : '-';

    const div = document.createElement('div');
    div.className = 'usuario-item';
    div.innerHTML = `
      <div class="usuario-info">
        <div class="usuario-nome">${usuario.nome || '-'}</div>
        <div class="usuario-email">${usuario.email || '-'}</div>
        <div class="usuario-data">Cadastrado em: ${criadoEmTexto}</div>
      </div>
      <div class="usuario-acoes">
        <button class="btn-aprovar" onclick="aprovarUsuario('${usuarioId}', '${nomeSeguro}')">Aprovar</button>
        <button class="btn-rejeitar" onclick="rejeitarUsuario('${usuarioId}', '${nomeSeguro}')">Rejeitar</button>
      </div>
    `;
    listaPendentes.appendChild(div);
  });
}

async function carregarUsuariosPendentes() {
  const carregando = document.getElementById('carregando');
  carregando.classList.remove('hidden');
  try {
    // Busca usuários e filtra pendentes por compatibilidade de modelo.
    const snap = await window.firebase.firestore().collection('usuarios_rh').get();
    carregando.classList.add('hidden');
    const docsPendentes = snap.docs.filter((doc) => {
      const usuario = doc.data() || {};
      const status = String(usuario.status || '').toLowerCase();
      const aprovado = usuario.aprovado === true;
      return status === 'pendente' || (!aprovado && status !== 'aprovado' && status !== 'rejeitado');
    }).map((doc) => ({ id: doc.id, usuario: doc.data() || {} }));

    renderizarListaPendentes(docsPendentes);
  } catch (err) {
    if (erroPermissaoFirestore(err)) {
      try {
        const data = await requisicaoBackendJson('/api/usuarios/pendentes');
        const docsPendentes = (Array.isArray(data) ? data : []).map((usuario) => ({
          id: String(usuario?.id || ''),
          usuario: usuario || {}
        }));
        carregando.classList.add('hidden');
        renderizarListaPendentes(docsPendentes);
        if (!docsPendentes.length) {
          definirMensagem('Nenhum usuário pendente de aprovação.', 'info');
        }
        return;
      } catch (erroBackend) {
        carregando.classList.add('hidden');
        definirMensagem(`❌ Erro ao carregar usuários (Firestore e backend): ${erroBackend.message}`, 'error');
        return;
      }
    }

    carregando.classList.add('hidden');
    definirMensagem(`❌ Erro ao carregar usuários: ${err.message}`, 'error');
  }
}

async function aprovarUsuario(usuarioId, usuarioNome) {
  const confirmar = await abrirDialogoAdmin({
    titulo: 'Confirmar Aprovação',
    mensagem: `Tem certeza que deseja aprovar ${usuarioNome}?`,
    modo: 'confirm',
    textoConfirmar: 'Aprovar'
  });

  if (!confirmar.confirmado) {
    return;
  }
  definirMensagem('⏳ Aprovando usuário...', 'loading');
  try {
    await window.firebase.firestore().collection('usuarios_rh').doc(usuarioId).update({ status: 'aprovado', aprovado: true, atualizado_em: new Date().toISOString() });
    definirMensagem(`✅ ${usuarioNome} foi aprovado com sucesso!`, 'success');
    setTimeout(() => {
      carregarUsuariosPendentes();
    }, 1500);
  } catch (err) {
    if (erroPermissaoFirestore(err)) {
      try {
        await requisicaoBackendJson(`/api/usuarios/aprovar/${encodeURIComponent(usuarioId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        definirMensagem(`✅ ${usuarioNome} foi aprovado com sucesso!`, 'success');
        setTimeout(() => {
          carregarUsuariosPendentes();
        }, 1500);
        return;
      } catch (erroBackend) {
        console.error('Erro ao aprovar (backend):', erroBackend);
        definirMensagem(`❌ Erro ao aprovar: ${erroBackend.message}`, 'error');
        return;
      }
    }

    console.error('Erro ao aprovar:', err);
    definirMensagem(`❌ Erro ao aprovar: ${err.message}`, 'error');
  }
}

async function rejeitarUsuario(usuarioId, usuarioNome) {
  const confirmar = await abrirDialogoAdmin({
    titulo: 'Confirmar Rejeição',
    mensagem: `Tem certeza que deseja rejeitar ${usuarioNome}? Esta ação não poderá ser desfeita.`,
    modo: 'confirm',
    textoConfirmar: 'Rejeitar'
  });

  if (!confirmar.confirmado) {
    return;
  }

  definirMensagem('⏳ Rejeitando usuário...', 'loading');
  try {
    // Atualiza o status do usuário para "rejeitado" no Firestore
    await window.firebase.firestore().collection('usuarios_rh').doc(usuarioId).update({ status: 'rejeitado', aprovado: false, atualizado_em: new Date().toISOString() });
    definirMensagem(`✅ ${usuarioNome} foi rejeitado e removido do sistema.`, 'success');
    setTimeout(() => {
      carregarUsuariosPendentes();
    }, 1500);
  } catch (err) {
    if (erroPermissaoFirestore(err)) {
      try {
        await requisicaoBackendJson(`/api/usuarios/rejeitar/${encodeURIComponent(usuarioId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        definirMensagem(`✅ ${usuarioNome} foi rejeitado e removido do sistema.`, 'success');
        setTimeout(() => {
          carregarUsuariosPendentes();
        }, 1500);
        return;
      } catch (erroBackend) {
        console.error('Erro ao rejeitar (backend):', erroBackend);
        definirMensagem(`❌ Erro ao rejeitar: ${erroBackend.message}`, 'error');
        return;
      }
    }

    console.error('Erro ao rejeitar:', err);
    definirMensagem(`❌ Erro ao rejeitar: ${err.message}`, 'error');
  }
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOMContentLoaded disparado em rh-admin.js');
    if (verificarAutenticacao()) {
      const nomeUsuario = obterNomeArmazenado();
      console.log(`👤 Usuário autenticado: ${nomeUsuario}`);
      iniciarMonitoramentoAcessoRh();
      carregarUsuariosPendentes();
    }
  });
} else {
  // DOM já carregado
  console.log('✅ DOM já estava carregado em rh-admin.js');
  if (verificarAutenticacao()) {
    const nomeUsuario = obterNomeArmazenado();
    console.log(`👤 Usuário autenticado: ${nomeUsuario}`);
    iniciarMonitoramentoAcessoRh();
    carregarUsuariosPendentes();
  }
}

if (togglePainelColaboradoresBtn) {
  togglePainelColaboradoresBtn.addEventListener('click', alternarPainelColaboradores);
}

if (buscaUsuariosCadastrados) {
  buscaUsuariosCadastrados.addEventListener('input', aplicarFiltrosUsuariosCadastrados);
}

if (filtroStatusUsuariosCadastrados) {
  filtroStatusUsuariosCadastrados.addEventListener('change', aplicarFiltrosUsuariosCadastrados);
}

if (toggleUsuariosCadastradosBtn) {
  toggleUsuariosCadastradosBtn.addEventListener('click', () => {
    mostrarTodosUsuariosCadastrados = !mostrarTodosUsuariosCadastrados;
    aplicarFiltrosUsuariosCadastrados();
  });
}

if (atualizarUsuariosCadastradosBtn) {
  atualizarUsuariosCadastradosBtn.addEventListener('click', carregarUsuariosCadastrados);
}
