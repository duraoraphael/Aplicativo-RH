const form = document.getElementById('rh-form');
const tipoAtestado = document.getElementById('tipoAtestado');
const horasWrapper = document.getElementById('horasComparecimentoWrapper');
const horasInput = document.getElementById('horasComparecimento');
const dataInicio = document.getElementById('dataInicio');
const dataFim = document.getElementById('dataFim');
const dias = document.getElementById('dias');
const arquivos = document.getElementById('arquivos');
const mensagem = document.getElementById('mensagem');
const botaoEnviar = form.querySelector('button[type="submit"]');
const rhAccessBtn = document.getElementById('rhAccessBtn');
let mensagemStatusTimer = null;




const MS_POR_DIA = 24 * 60 * 60 * 1000;
const BACKEND_URL = 'http://localhost:3001';

function registrarEventoBackend(acao, detalhes = {}) {
  const payload = {
    acao,
    pagina: 'index.html',
    email: localStorage.getItem('rh_user_email') || '',
    usuarioId: localStorage.getItem('rh_user_id') || '',
    detalhes
  };

  fetch(`${BACKEND_URL}/api/eventos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}

function toUTCDate(dateString) {
  const [ano, mes, dia] = dateString.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function toInputDate(dateObj) {
  const ano = dateObj.getUTCFullYear();
  const mes = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function calcularDiasPorIntervalo() {
  if (!dataInicio.value || !dataFim.value) {
    return;
  }

  const inicio = toUTCDate(dataInicio.value);
  const fim = toUTCDate(dataFim.value);
  const diferenca = Math.floor((fim - inicio) / MS_POR_DIA) + 1;

  if (diferenca >= 1) {
    dias.value = String(diferenca);
    dataFim.setCustomValidity('');
  } else {
    dataFim.setCustomValidity('A data de fim deve ser igual ou maior que a data de início.');
  }
}

function calcularFimPorDias() {
  if (!dataInicio.value || !dias.value) {
    return;
  }

  const totalDias = Number(dias.value);
  if (!Number.isInteger(totalDias) || totalDias < 1) {
    return;
  }

  const inicio = toUTCDate(dataInicio.value);
  const fim = new Date(inicio.getTime() + (totalDias - 1) * MS_POR_DIA);
  dataFim.value = toInputDate(fim);
  dataFim.setCustomValidity('');
}

function atualizarCampoHoras() {
  const isDeclaracao = tipoAtestado.value === 'Declaração';
  horasWrapper.classList.toggle('hidden', !isDeclaracao);
  horasInput.required = isDeclaracao;

  if (!isDeclaracao) {
    horasInput.value = '';
  }
}

function nomePdf(nomeOriginal) {
  const semExtensao = nomeOriginal.replace(/\.[^/.]+$/, '');
  return `${semExtensao}.pdf`;
}

function formatarDataCurtaParaNome(dataISO) {
  if (!dataISO || typeof dataISO !== 'string') {
    return '00.00.00';
  }

  const [ano, mes, dia] = dataISO.split('-');
  const anoCurto = (ano || '').slice(-2);
  return `${dia || '00'}.${mes || '00'}.${anoCurto || '00'}`;
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

  const orientacao = imagem.width > imagem.height ? 'l' : 'p';
  const pdf = new jsPDF({ orientation: orientacao, unit: 'pt', format: 'a4' });
  const larguraPagina = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();

  const escala = Math.min(larguraPagina / imagem.width, alturaPagina / imagem.height);
  const larguraFinal = imagem.width * escala;
  const alturaFinal = imagem.height * escala;
  const x = (larguraPagina - larguraFinal) / 2;
  const y = (alturaPagina - alturaFinal) / 2;

  const formatoImagem = arquivo.type.includes('png') ? 'PNG' : 'JPEG';
  pdf.addImage(dataUrl, formatoImagem, x, y, larguraFinal, alturaFinal);
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
dataInicio.addEventListener('change', () => {
  calcularDiasPorIntervalo();
  calcularFimPorDias();
});
dataFim.addEventListener('change', calcularDiasPorIntervalo);
dias.addEventListener('input', calcularFimPorDias);

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

  if (!form.checkValidity()) {
    form.reportValidity();
    definirMensagemStatus('Revise os campos obrigatórios antes de enviar.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  if (!window.jspdf) {
    definirMensagemStatus('Não foi possível carregar a biblioteca de PDF.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  const listaArquivos = Array.from(arquivos.files || []);
  if (!listaArquivos.length) {
    definirMensagemStatus('Selecione ao menos um arquivo para converter.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  definirMensagemStatus('Convertendo e enviando arquivo(s)...', 'info');

  try {
    const convertidos = [];
    const naoSuportados = [];

    for (const arquivo of listaArquivos) {
      const convertido = await converterArquivoParaPdf(arquivo);
      if (convertido) {
        convertidos.push(convertido);
      } else {
        naoSuportados.push(arquivo.name);
      }
    }

    if (naoSuportados.length) {
      definirMensagemStatus(`Formato não suportado para conversão automática: ${naoSuportados.join(', ')}.`, 'error');
      definirEstadoEnvio(false);
      return;
    }

    // Envio para backend Node.js
    // Validar dias - se inválido, recalcular a partir das datas
    let diasEnvio = Number(dias.value) || 0;
    
    if (!Number.isInteger(diasEnvio) || diasEnvio < 1 || diasEnvio > 365) {
      // Recalcular dias a partir das datas
      if (dataInicio.value && dataFim.value) {
        const inicio = toUTCDate(dataInicio.value);
        const fim = toUTCDate(dataFim.value);
        diasEnvio = Math.floor((fim - inicio) / MS_POR_DIA) + 1;
      } else {
        throw new Error('Preencha as datas de início e fim para calcular os dias.');
      }
    }
    
    // Garantir que dias está entre 1 e 365
    if (diasEnvio < 1 || diasEnvio > 365) {
      throw new Error('Os dias devem ser entre 1 e 365. Verifique as datas de início e fim.');
    }
    
    const nomePdfPadrao = montarNomePdfPadrao();
    const arquivosPayload = [];

    for (let i = 0; i < convertidos.length; i += 1) {
      const convertido = convertidos[i];
      const nomeArquivo = convertidos.length > 1
        ? nomePdfPadrao.replace('.pdf', ` - ANEXO ${i + 1}.pdf`)
        : nomePdfPadrao;

      const base64 = await blobParaBase64(convertido.blob);
      arquivosPayload.push({
        nome: nomeArquivo,
        tipo: 'application/pdf',
        conteudoBase64: base64
      });
    }

    const dadosEnvio = {
      nome: document.getElementById('nome').value.trim(),
      funcao: document.getElementById('funcao').value.trim(),
      projeto: document.getElementById('projeto').value,
      tipo_atestado: tipoAtestado.value,
      horas_comparecimento: horasInput.value ? String(Number(horasInput.value)) : '',
      data_inicio: dataInicio.value,
      data_fim: dataFim.value,
      dias: diasEnvio,
      arquivos: arquivosPayload
    };
    
    const resp = await fetch(`${BACKEND_URL}/api/envios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dadosEnvio)
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => '');
      throw new Error(erro || 'Erro ao enviar atestado.');
    }
    registrarEventoBackend('envio_realizado', {
      projeto: dadosEnvio.projeto,
      tipo_atestado: dadosEnvio.tipo_atestado
    });
    window.location.href = 'sucesso.html';
  } catch (error) {
    definirMensagemStatus(error?.message || 'Erro ao enviar atestado.', 'error');
    definirEstadoEnvio(false);
  }
});

atualizarCampoHoras();
registrarEventoBackend('acesso_pagina');
