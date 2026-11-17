// ----- Configurações (mude aqui o nome e a foto) -----
const NOME_ASSISTENTE = 'Nyx';
const FOTO_ASSISTENTE = '../assets/avatar.png';

// ----- Elementos da tela -----
const areaMensagens = document.getElementById('mensagens');
const formulario = document.getElementById('formulario');
const campoTexto = document.getElementById('texto');
const painelLista = document.getElementById('painel-lista');
const contadorPendentes = document.getElementById('contador-pendentes');
const contadorConcluidas = document.getElementById('contador-concluidas');
const botoesAba = document.querySelectorAll('.aba');

// ----- Memória da assistente -----
let tarefas = carregarTarefas(); // vem do armazenamento.js
let etapa = 'nenhuma'; // em que ponto da conversa guiada estamos
let rascunho = {}; // a tarefa que está sendo criada agora
let abaAtual = 'pendentes'; // qual aba do painel está aberta
let seletorAtivo = null; // o seletor de data que está na conversa (se houver)
let balaoSaudacao = null; // o balão da mensagem de boas-vindas (a contagem dele se atualiza sozinha)

// ============================================================
//  Ferramentas de texto e data
// ============================================================
function limparTexto(texto) {
  return texto.toLowerCase().replace(/[^\p{L}\s]/gu, '').trim();
}

// Pergunta: "alguma palavra da lista aparece na frase?"
function temPalavra(palavras, lista) {
  return lista.some((p) => palavras.includes(p));
}

function plural(quantidade, singular, varios) {
  return quantidade === 1 ? singular : varios;
}

// Entende textos como "hoje 15:30", "amanhã 9h" ou "25/10 14h30"
// Devolve uma data, ou null se não entender
function entenderData(texto) {
  const t = texto.toLowerCase();

  // 1) Procura a hora
  const achouHora = t.match(/(\d{1,2})\s*(?::|h)\s*(\d{2})?/);
  if (!achouHora) return null;
  const hora = Number(achouHora[1]);
  const minuto = achouHora[2] ? Number(achouHora[2]) : 0;
  if (hora > 23 || minuto > 59) return null;

  // 2) Procura o dia
  const agora = new Date();
  let data;

  if (t.includes('hoje')) {
    data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto);
  } else if (t.includes('amanhã') || t.includes('amanha')) {
    data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, hora, minuto);
  } else {
    const achouDia = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
    if (!achouDia) return null;
    const dia = Number(achouDia[1]);
    const mes = Number(achouDia[2]);
    const ano = achouDia[3] ? Number(achouDia[3]) : agora.getFullYear();
    data = new Date(ano, mes - 1, dia, hora, minuto);
    // Confere se o dia existe de verdade (31/02 não existe)
    if (data.getDate() !== dia || data.getMonth() !== mes - 1) return null;
  }

  return data;
}

// Mostra o ano só quando não é o ano atual
function formatarData(valor) {
  const data = new Date(valor);
  const opcoes = {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };
  if (data.getFullYear() !== new Date().getFullYear()) opcoes.year = 'numeric';
  return data.toLocaleString('pt-BR', opcoes);
}

// O campo de data do HTML quer o formato "2026-10-09T17:00" (no horário local)
function paraCampoDeData(data) {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function proximaHoraCheia() {
  const data = new Date();
  data.setHours(data.getHours() + 1, 0, 0, 0);
  return data;
}

function porData(a, b) {
  return new Date(a.quando) - new Date(b.quando);
}

function estaAtrasada(tarefa) {
  return !tarefa.concluida && new Date(tarefa.quando) < new Date();
}

// ============================================================
//  Avatar
// ============================================================
// Se a foto não existir, remove a <img> e sobra a inicial do nome
function prepararAvatar(img) {
  if (img.complete && img.naturalWidth === 0) img.remove();
  img.addEventListener('error', () => img.remove());
}

function criarAvatar() {
  const avatar = document.createElement('div');
  avatar.className = 'avatar';

  const inicial = document.createElement('span');
  inicial.textContent = NOME_ASSISTENTE[0];

  const img = document.createElement('img');
  img.src = FOTO_ASSISTENTE;
  img.alt = '';

  avatar.append(inicial, img);
  prepararAvatar(img);
  return avatar;
}

// ============================================================
//  Mensagens na tela
// ============================================================
function criarLinha(autor) {
  const linha = document.createElement('div');
  linha.className = 'linha ' + autor;

  if (autor === 'assistente') linha.appendChild(criarAvatar());

  const balao = document.createElement('div');
  balao.className = 'balao';
  linha.appendChild(balao);

  areaMensagens.appendChild(linha);
  return { linha, balao };
}

function rolarParaOFim() {
  areaMensagens.scrollTop = areaMensagens.scrollHeight;
}

function adicionarMensagem(texto, autor) {
  const { balao } = criarLinha(autor);
  balao.textContent = texto;
  rolarParaOFim();
}

function mostrarDigitando() {
  const { linha, balao } = criarLinha('assistente');
  balao.classList.add('digitando');
  for (let i = 0; i < 3; i++) {
    balao.appendChild(document.createElement('span'));
  }
  rolarParaOFim();
  return linha;
}

// Mostra a mensagem do usuário, o "digitando..." e depois a resposta.
// "gerarResposta" é uma função que devolve o texto da resposta.
function conversar(textoDoUsuario, gerarResposta) {
  adicionarMensagem(textoDoUsuario, 'usuario');

  const digitando = mostrarDigitando();
  setTimeout(function () {
    digitando.remove();
    adicionarMensagem(gerarResposta(), 'assistente');

    // Se a Nyx está esperando uma data, mostra o seletor. Senão, tira o seletor.
    if (etapa === 'quando') {
      mostrarSeletorDeData();
    } else {
      removerSeletor();
    }
  }, 700);
}

// ============================================================
//  Seletor de data e hora (aparece dentro do chat)
// ============================================================
function removerSeletor() {
  if (seletorAtivo) {
    seletorAtivo.remove();
    seletorAtivo = null;
  }
}

function mostrarSeletorDeData() {
  removerSeletor();

  const { linha, balao } = criarLinha('assistente');
  balao.classList.add('seletor');

  const rotulo = document.createElement('span');
  rotulo.textContent = '📅 Escolha o dia e a hora:';

  const campo = document.createElement('input');
  campo.type = 'datetime-local';
  campo.value = paraCampoDeData(proximaHoraCheia());
  campo.min = paraCampoDeData(new Date());

  const confirmar = document.createElement('button');
  confirmar.type = 'button';
  confirmar.className = 'btn-confirmar';
  confirmar.textContent = 'Confirmar';

  confirmar.addEventListener('click', function () {
    if (campo.value === '') return; // não escolheu nada ainda

    const data = new Date(campo.value);
    removerSeletor();
    conversar(formatarData(data), () => tentarAgendar(data));
  });

  balao.append(rotulo, campo, confirmar);
  seletorAtivo = linha;
  rolarParaOFim();
}

// ============================================================
//  Tarefas: criar, concluir, excluir
// ============================================================
function aplicarMudancas() {
  salvarTarefas(tarefas); // guarda no armazenamento
  renderizarPainel(); // redesenha o painel
}

function criarTarefa(titulo, data) {
  tarefas.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    titulo: titulo,
    quando: data.toISOString(),
    concluida: false,
    concluidaEm: null,
    criadaEm: new Date().toISOString(),
    // Controle dos lembretes: já avisou "daqui a pouco"? já avisou "é agora"?
    // Se faltar menos que a antecedência, nem faz sentido o aviso "daqui a pouco".
    avisouAntes: data.getTime() - Date.now() <= ANTECEDENCIA_MINUTOS * 60 * 1000,
    avisouNaHora: false,
  });
  aplicarMudancas();
}

function alternarConclusao(id) {
  const tarefa = tarefas.find((t) => t.id === id);
  if (!tarefa) return;

  tarefa.concluida = !tarefa.concluida;
  tarefa.concluidaEm = tarefa.concluida ? new Date().toISOString() : null;
  aplicarMudancas();
}

function excluirTarefa(id) {
  tarefas = tarefas.filter((t) => t.id !== id);
  aplicarMudancas();
}

// Chamada quando a Nyx já sabe o título e agora recebeu a data
function tentarAgendar(data) {
  if (data < new Date()) {
    return 'Essa data já passou! 😅 Escolha uma data futura.';
  }

  const titulo = rascunho.titulo;
  criarTarefa(titulo, data);
  etapa = 'nenhuma';
  rascunho = {};
  return 'Pronto! ✅ Anotei "' + titulo + '" para ' + formatarData(data) + '. Eu te aviso quando chegar a hora 🔔';
}

// ============================================================
//  Painel de tarefas (lado direito)
// ============================================================
function criarBotaoAcao(simbolo, dica, aoClicar) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'acao';
  botao.textContent = simbolo;
  botao.title = dica;
  botao.setAttribute('aria-label', dica);
  botao.addEventListener('click', aoClicar);
  return botao;
}

function criarCartaoTarefa(tarefa) {
  const item = document.createElement('li');
  item.className = 'tarefa';
  if (tarefa.concluida) {
    item.classList.add('feita');
  } else if (estaAtrasada(tarefa)) {
    item.classList.add('atrasada');
  }

  // Título e data
  const info = document.createElement('div');
  info.className = 'tarefa-info';

  const titulo = document.createElement('span');
  titulo.className = 'tarefa-titulo';
  titulo.textContent = tarefa.titulo;

  const data = document.createElement('span');
  data.className = 'tarefa-data';
  if (tarefa.concluida) {
    data.textContent = 'Concluída em ' + formatarData(tarefa.concluidaEm);
  } else if (estaAtrasada(tarefa)) {
    data.textContent = '⚠️ Atrasada · ' + formatarData(tarefa.quando);
  } else {
    data.textContent = formatarData(tarefa.quando);
  }

  info.append(titulo, data);

  // Botões
  const acoes = document.createElement('div');
  acoes.className = 'tarefa-acoes';

  const botaoConcluir = tarefa.concluida
    ? criarBotaoAcao('↩', 'Voltar para pendentes', () => alternarConclusao(tarefa.id))
    : criarBotaoAcao('✓', 'Marcar como concluída', () => alternarConclusao(tarefa.id));

  // Excluir pede confirmação: o 1º clique "arma", o 2º clique exclui
  let esperandoConfirmacao = false;
  const botaoExcluir = criarBotaoAcao('🗑', 'Excluir', function () {
    if (esperandoConfirmacao) {
      excluirTarefa(tarefa.id);
      return;
    }
    esperandoConfirmacao = true;
    botaoExcluir.textContent = 'Excluir?';
    botaoExcluir.classList.add('perigo');
    setTimeout(function () {
      esperandoConfirmacao = false;
      botaoExcluir.textContent = '🗑';
      botaoExcluir.classList.remove('perigo');
    }, 3000);
  });

  acoes.append(botaoConcluir, botaoExcluir);
  item.append(info, acoes);
  return item;
}

function renderizarPainel() {
  const pendentes = tarefas.filter((t) => !t.concluida).sort(porData);
  const concluidas = tarefas
    .filter((t) => t.concluida)
    .sort((a, b) => new Date(b.concluidaEm) - new Date(a.concluidaEm));

  contadorPendentes.textContent = pendentes.length;
  contadorConcluidas.textContent = concluidas.length;
  atualizarSaudacao(); // mantém a contagem da mensagem de boas-vindas em dia

  const visiveis = abaAtual === 'pendentes' ? pendentes : concluidas;

  painelLista.innerHTML = '';

  if (visiveis.length === 0) {
    const vazio = document.createElement('li');
    vazio.className = 'vazio';
    vazio.textContent =
      abaAtual === 'pendentes'
        ? 'Nada pendente por aqui 🎉\nDiga "nova tarefa" no chat.'
        : 'Nenhuma tarefa concluída ainda.\nQuando você marcar ✓, ela aparece aqui.';
    painelLista.appendChild(vazio);
    return;
  }

  for (const tarefa of visiveis) {
    painelLista.appendChild(criarCartaoTarefa(tarefa));
  }
}

for (const botao of botoesAba) {
  botao.addEventListener('click', function () {
    abaAtual = botao.dataset.aba;
    for (const outro of botoesAba) {
      outro.classList.toggle('ativa', outro === botao);
    }
    renderizarPainel();
  });
}

// ============================================================
//  Resumos para o chat
// ============================================================
function resumoPendentes() {
  const pendentes = tarefas.filter((t) => !t.concluida).sort(porData);

  if (pendentes.length === 0) {
    return 'Você não tem nada pendente. Diga "nova tarefa" pra anotar algo! ✨';
  }

  const linhas = pendentes.map((t, i) => {
    const aviso = estaAtrasada(t) ? ' ⚠️ atrasada' : '';
    return i + 1 + '. ' + t.titulo + ' — ' + formatarData(t.quando) + aviso;
  });

  return '📋 Pendentes:\n' + linhas.join('\n');
}

function resumoConcluidas() {
  const concluidas = tarefas
    .filter((t) => t.concluida)
    .sort((a, b) => new Date(b.concluidaEm) - new Date(a.concluidaEm));

  if (concluidas.length === 0) {
    return 'Você ainda não concluiu nenhuma tarefa. Marque o ✓ no painel quando terminar uma!';
  }

  const linhas = concluidas.map((t, i) => {
    return i + 1 + '. ' + t.titulo + ' — concluída em ' + formatarData(t.concluidaEm);
  });

  return '✅ Concluídas:\n' + linhas.join('\n');
}

// ============================================================
//  Mensagem de boas-vindas (a contagem se atualiza sozinha)
// ============================================================
function textoDaSaudacao() {
  const pendentes = tarefas.filter((t) => !t.concluida);
  const atrasadas = pendentes.filter(estaAtrasada);

  let texto = 'Oi! Eu sou a ' + NOME_ASSISTENTE + ' 💜 Diga "nova tarefa" pra anotar algo, ou "ajuda" pra ver o que eu sei fazer.\n\n';

  if (pendentes.length === 0) {
    return texto + 'Você não tem nenhuma tarefa pendente 🎉';
  }

  texto += 'Você tem ' + pendentes.length + ' ' + plural(pendentes.length, 'tarefa pendente', 'tarefas pendentes');
  if (atrasadas.length > 0) {
    texto += ', ' + atrasadas.length + ' ' + plural(atrasadas.length, 'atrasada', 'atrasadas') + ' ⚠️';
  }
  return texto + '. Dá uma olhada no painel ao lado!';
}

// Reescreve o texto do balão com os números de agora
function atualizarSaudacao() {
  if (balaoSaudacao) balaoSaudacao.textContent = textoDaSaudacao();
}

// ============================================================
//  O "cérebro" da assistente
// ============================================================
function responder(texto) {
  const limpo = limparTexto(texto);
  const palavras = limpo.split(/\s+/);

  // Se estamos no meio de uma conversa guiada, ela tem prioridade
  if (etapa !== 'nenhuma') {
    // Só cancela se a mensagem inteira for "cancelar"
    // (assim uma tarefa chamada "Cancelar assinatura" não cancela nada)
    if (limpo === 'cancelar' || limpo === 'cancela') {
      etapa = 'nenhuma';
      rascunho = {};
      return 'Tudo bem, cancelei. 👍';
    }

    if (etapa === 'titulo') {
      rascunho.titulo = texto.trim();
      etapa = 'quando';
      return (
        'Anotado: "' + rascunho.titulo + '" 📝\n' +
        'Pra quando é? Use o seletor abaixo, ou escreva assim:\n' +
        '• hoje 15:30\n' +
        '• amanhã 9h\n' +
        '• 25/10 14h30'
      );
    }

    if (etapa === 'quando') {
      const data = entenderData(texto);
      if (data === null) {
        return 'Hmm, não entendi essa data 🤔 Use o seletor abaixo, ou escreva tipo "amanhã 9h" ou "25/10 14:30".';
      }
      return tentarAgendar(data);
    }
  }

  // Conversa normal (a ordem importa: "tarefas concluídas" cai no 2º bloco, não no 3º)
  if (temPalavra(palavras, ['nova', 'novo', 'anotar', 'adicionar', 'criar'])) {
    etapa = 'titulo';
    rascunho = {};
    return 'Claro! 😊 Qual é a tarefa ou evento? (Se mudar de ideia, é só dizer "cancelar")';
  }

  if (temPalavra(palavras, ['concluidas', 'concluídas', 'feitas', 'finalizadas'])) {
    return resumoConcluidas();
  }

  if (temPalavra(palavras, ['tarefas', 'lista', 'agenda', 'eventos', 'pendentes'])) {
    return resumoPendentes();
  }

  if (temPalavra(palavras, ['oi', 'olá', 'ola'])) {
    return 'Oi! 😊 Eu sou a ' + NOME_ASSISTENTE + ', sua assistente de eventos. Diga "nova tarefa" pra anotar algo!';
  }

  if (temPalavra(palavras, ['ajuda'])) {
    return (
      'Posso fazer isso por você:\n' +
      '• "nova tarefa": anoto um compromisso\n' +
      '• "tarefas": mostro o que está pendente\n' +
      '• "concluídas": mostro o que você já fez\n' +
      '• "cancelar": desisto do que estávamos fazendo\n\n' +
      'O painel ao lado também tem botões pra concluir ✓ e excluir 🗑.'
    );
  }

  return 'Ainda estou aprendendo a entender isso 😅 Tente "nova tarefa", "tarefas" ou "ajuda".';
}

// ============================================================
//  Enviar mensagem
// ============================================================
formulario.addEventListener('submit', function (evento) {
  evento.preventDefault();

  const texto = campoTexto.value.trim();
  if (texto === '') return;

  campoTexto.value = '';
  conversar(texto, () => responder(texto));
});

// ============================================================
//  Montagem inicial da tela
// ============================================================
document.getElementById('nome').textContent = NOME_ASSISTENTE;

const avatarTopo = criarAvatar();
avatarTopo.classList.add('avatar-grande');
document.getElementById('avatar-topo').replaceWith(avatarTopo);

// Cria o balão da saudação e guarda ele numa variável, para poder atualizar depois
balaoSaudacao = criarLinha('assistente').balao;
atualizarSaudacao();

renderizarPainel();
// Atualiza o painel (e a saudação) a cada 30 segundos (uma tarefa pode ter ficado atrasada)
setInterval(renderizarPainel, 30000);

campoTexto.focus();
