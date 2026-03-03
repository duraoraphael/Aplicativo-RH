const BACKEND_URL = 'http://localhost:3001';

const projetoTitulo = document.getElementById('projetoTitulo');
const projetoDescricao = document.getElementById('projetoDescricao');
const detalhesStatus = document.getElementById('detalhesStatus');
const detalhesContainer = document.getElementById('detalhesContainer');
const filtroNomeInput = document.getElementById('filtroNome');
const filtroDataInicioInput = document.getElementById('filtroDataInicio');
const filtroDataFimInput = document.getElementById('filtroDataFim');
const filtroTipoSelect = document.getElementById('filtroTipoAtestado');
const baixarFiltradosBtn = document.getElementById('baixarFiltradosBtn');

const BASES_PROJETO = {
  '736': 'Base Imbetiba',
  '737': 'Base Imboassica',
  '743': 'Bases: Cabiunas, Severina e Barra do Furado',
  '741': 'Bases: UTE, Áreas Externa e Tapera'
};

let registrosProjeto = [];
let registrosProjetoFiltrados = [];
let downloadMassaEmAndamento = false;
let detalhesStatusTimer = null;

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

function setDetalhesStatus(texto, tipo = 'info') {
  if (!detalhesStatus) return;

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

function validarUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function criarDetalheItem(label, valor) {
  return `<div class="detalhe-item"><span>${label}</span><strong>${valor || '-'}</strong></div>`;
}

function criarCardRegistro(record) {
  const card = document.createElement('article');
  card.className = 'detalhe-card';

  const arquivos = Array.isArray(record.arquivos)
    ? record.arquivos
    : (typeof record.arquivos === 'string' && record.arquivos ? [record.arquivos] : []);

  const arquivosHtml = arquivos.length
    ? arquivos
      .filter((urlArquivo) => validarUrl(urlArquivo))
      .map((urlArquivo, indice) => {
        const nomeExibicao = montarNomePdfPorRegistro(record, indice, arquivos.length);
        return `<a class="download-pdf-link" href="${urlArquivo}" download="${nomeExibicao}" data-download-name="${encodeURIComponent(nomeExibicao)}">${nomeExibicao}</a>`;
      })
      .join('<br>')
    : '-';

  card.innerHTML = `
    <h3>${record.nome || 'Sem nome informado'}</h3>
    <div class="detalhe-grid">
      ${criarDetalheItem('Função', record.funcao)}
      ${criarDetalheItem('Projeto', record.projeto)}
      ${criarDetalheItem('Tipo', record.tipo_atestado)}
      ${criarDetalheItem('Horas', record.horas_comparecimento || '-')}
      ${criarDetalheItem('Data início', formatarData(record.data_inicio))}
      ${criarDetalheItem('Data fim', formatarData(record.data_fim))}
      ${criarDetalheItem('Dias', record.dias)}
      ${criarDetalheItem('Enviado em', formatarDataHora(record.criado_em))}
    </div>
    <div class="detalhe-arquivos">
      <span>Arquivo(s)</span>
      <div>${arquivosHtml}</div>
    </div>
  `;

  return card;
}

async function baixarArquivoComNome(urlArquivo, nomeDownload) {
  const resposta = await fetch(urlArquivo, { credentials: 'omit' });
  if (!resposta.ok) throw new Error('Falha ao baixar arquivo.');

  const blob = await resposta.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = nomeDownload;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function ativarDownloadComNome() {
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a.download-pdf-link');
    if (!link) return;

    event.preventDefault();
    const urlArquivo = link.getAttribute('href');
    const nomeCodificado = link.getAttribute('data-download-name') || '';
    const nomeDownload = nomeCodificado ? decodeURIComponent(nomeCodificado) : 'arquivo.pdf';

    try {
      await baixarArquivoComNome(urlArquivo, nomeDownload);
    } catch {
      window.open(urlArquivo, '_blank');
    }
  });
}

function coletarArquivosDosRegistros(registros) {
  return registros.flatMap((registro) => {
    const arquivos = Array.isArray(registro?.arquivos)
      ? registro.arquivos
      : (typeof registro?.arquivos === 'string' && registro.arquivos ? [registro.arquivos] : []);

    return arquivos
      .filter((url) => validarUrl(url))
      .map((urlArquivo, indice) => ({
        url: urlArquivo,
        nome: montarNomePdfPorRegistro(registro, indice, arquivos.length)
      }));
  });
}

function atualizarBotaoDownloadEmMassa() {
  if (!baixarFiltradosBtn) return;
  const totalArquivos = coletarArquivosDosRegistros(registrosProjetoFiltrados).length;
  baixarFiltradosBtn.textContent = totalArquivos > 0
    ? `Baixar PDFs filtrados (${totalArquivos})`
    : 'Baixar PDFs filtrados';
  baixarFiltradosBtn.disabled = totalArquivos === 0 || downloadMassaEmAndamento;
}

async function baixarPdfsFiltrados() {
  if (downloadMassaEmAndamento) return;

  const arquivos = coletarArquivosDosRegistros(registrosProjetoFiltrados);
  if (!arquivos.length) {
    setDetalhesStatus('Não há PDFs nos filtros atuais para baixar.', 'info');
    return;
  }

  if (!window.JSZip) {
    setDetalhesStatus('Biblioteca ZIP não carregada. Atualize a página e tente novamente.', 'error');
    return;
  }

  downloadMassaEmAndamento = true;
  atualizarBotaoDownloadEmMassa();

  try {
    const zip = new window.JSZip();
    const nomesUsados = new Set();

    for (const arquivo of arquivos) {
      const resposta = await fetch(arquivo.url, { credentials: 'omit' });
      if (!resposta.ok) continue;

      const blob = await resposta.blob();
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
    const params = new URLSearchParams(window.location.search);
    const codigoProjeto = params.get('projeto') || 'projeto';
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `PDFs-Projeto-${codigoProjeto}-${timestamp}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);

    setDetalhesStatus(`ZIP gerado com sucesso: ${arquivos.length} PDF(s).`, 'success');
  } catch (error) {
    setDetalhesStatus(`Erro ao gerar ZIP: ${error?.message || 'Falha no download em massa.'}`, 'error');
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

function aplicarFiltros() {
  const nomeFiltro = normalizarTexto(filtroNomeInput.value);
  const dataInicioFiltro = filtroDataInicioInput.value;
  const dataFimFiltro = filtroDataFimInput.value;
  const dataMinFiltro = dataInicioFiltro && dataFimFiltro && dataInicioFiltro > dataFimFiltro ? dataFimFiltro : dataInicioFiltro;
  const dataMaxFiltro = dataInicioFiltro && dataFimFiltro && dataInicioFiltro > dataFimFiltro ? dataInicioFiltro : dataFimFiltro;
  const tipoFiltro = filtroTipoSelect.value;

  const filtrados = registrosProjeto.filter((registro) => {
    const nomeRegistro = normalizarTexto(registro?.nome);
    const dataRegistro = obterDataISO(registro?.criado_em);
    const tipoRegistro = String(registro?.tipo_atestado || '');

    const correspondeNome = !nomeFiltro || nomeRegistro.includes(nomeFiltro);
    const correspondeDataInicio = !dataMinFiltro || (dataRegistro && dataRegistro >= dataMinFiltro);
    const correspondeDataFim = !dataMaxFiltro || (dataRegistro && dataRegistro <= dataMaxFiltro);
    const correspondeTipo = !tipoFiltro || tipoRegistro === tipoFiltro;

    return correspondeNome && correspondeDataInicio && correspondeDataFim && correspondeTipo;
  });

  registrosProjetoFiltrados = filtrados;
  atualizarBotaoDownloadEmMassa();
  detalhesContainer.innerHTML = '';

  if (!filtrados.length) {
    setDetalhesStatus('Nenhum registro encontrado com os filtros aplicados.', 'info');
    return;
  }

  filtrados.forEach((registro) => detalhesContainer.appendChild(criarCardRegistro(registro)));
  setDetalhesStatus(`Mostrando ${filtrados.length} de ${registrosProjeto.length} registro(s).`, 'success');
}

function configurarEventosFiltros() {
  filtroNomeInput.addEventListener('input', aplicarFiltros);
  filtroDataInicioInput.addEventListener('change', aplicarFiltros);
  filtroDataFimInput.addEventListener('change', aplicarFiltros);
  filtroTipoSelect.addEventListener('change', aplicarFiltros);
  if (baixarFiltradosBtn) {
    baixarFiltradosBtn.addEventListener('click', baixarPdfsFiltrados);
  }
}

async function carregarDetalhesProjeto() {
  const params = new URLSearchParams(window.location.search);
  const codigoProjeto = params.get('projeto') || '';

  if (!codigoProjeto) {
    setDetalhesStatus('Projeto não informado.', 'error');
    return;
  }

  projetoTitulo.textContent = `Projeto ${codigoProjeto}`;
  projetoDescricao.textContent = BASES_PROJETO[codigoProjeto] || 'Bases relacionadas ao projeto selecionado.';

  setDetalhesStatus('Carregando informações preenchidas...', 'info');

  try {
    const todosRegistros = await requisicaoBackendJson(`${BACKEND_URL}/api/envios`);
    const padraoProjeto = new RegExp(`\\b${codigoProjeto}\\b`);

    registrosProjeto = todosRegistros.filter((registro) => padraoProjeto.test(String(registro?.projeto || '')));
    registrosProjetoFiltrados = registrosProjeto;

    if (!registrosProjeto.length) {
      detalhesContainer.innerHTML = '';
      preencherFiltroTipo([]);
      atualizarBotaoDownloadEmMassa();
      setDetalhesStatus('Nenhuma informação encontrada para este projeto.', 'info');
      return;
    }

    preencherFiltroTipo(registrosProjeto);
    aplicarFiltros();
  } catch (error) {
    setDetalhesStatus(`Erro ao carregar informações: ${error?.message || 'Falha ao carregar dados do projeto.'}`, 'error');
  }
}

ativarDownloadComNome();
configurarEventosFiltros();
carregarDetalhesProjeto();
