const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const NOME_APP = 'Nyx - Assistente de Eventos';

let janela = null;
let bandeja = null; // fica numa variável de fora para o Windows não "esquecer" o ícone
let icone = null;
let saindo = false; // true quando o usuário escolheu "Sair" de verdade
let avisouBandeja = false;
const avisosAtivos = new Set(); // guarda as notificações até o clique, para o Electron não esquecê-las

// No Windows, notificações precisam de um "identificador de aplicativo".
// Em desenvolvimento usamos o caminho do executável; no app instalado, um nome fixo.
// (Essa função só existe no Windows, por isso o "if".)
if (process.platform === 'win32') {
  app.setAppUserModelId(app.isPackaged ? 'com.nyx.assistente-eventos' : process.execPath);
}

// ============================================================
//  Ícone: a sua imagem em assets/avatar.png
// ============================================================
function carregarIcone() {
  const arquivo = path.join(__dirname, '..', 'assets', 'avatar.png');
  if (!fs.existsSync(arquivo)) {
    throw new Error('Não achei a imagem da Nyx. Coloque o arquivo aqui: ' + arquivo);
  }

  // Corta a imagem num quadrado (pelo centro) para o ícone não ficar achatado
  let imagem = nativeImage.createFromPath(arquivo);
  const { width, height } = imagem.getSize();
  const lado = Math.min(width, height);
  imagem = imagem.crop({
    x: Math.floor((width - lado) / 2),
    y: Math.floor((height - lado) / 2),
    width: lado,
    height: lado,
  });

  return imagem.resize({ width: 64, height: 64 });
}

// ============================================================
//  Iniciar com o Windows
// ============================================================
function opcoesDeInicio() {
  // Instalado: o próprio programa. Em desenvolvimento: electron.exe + a pasta do projeto.
  // O "--oculto" faz o app abrir direto na bandeja, sem mostrar a janela.
  const argumentos = app.isPackaged ? ['--oculto'] : ['"' + app.getAppPath() + '"', '--oculto'];
  return { path: process.execPath, args: argumentos };
}

function iniciaComOWindows() {
  return app.getLoginItemSettings(opcoesDeInicio()).openAtLogin;
}

function definirInicioComOWindows(ativar) {
  app.setLoginItemSettings({ openAtLogin: ativar, ...opcoesDeInicio() });
}

// ============================================================
//  Janela
// ============================================================
function mostrarJanela() {
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

function criarJanela(iniciarOculta) {
  janela = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    title: NOME_APP,
    icon: icone,
    show: false, // só aparece quando estiver pronta (e se não for para iniciar oculta)
    autoHideMenuBar: true,
    backgroundColor: '#0f1420',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // continua conferindo os lembretes mesmo escondida
    },
  });

  janela.loadFile(path.join(__dirname, 'index.html'));

  janela.once('ready-to-show', function () {
    if (!iniciarOculta) janela.show();
  });

  // Fechar a janela (X) só ESCONDE: o app continua na bandeja para poder te avisar
  janela.on('close', function (evento) {
    if (saindo) return;
    evento.preventDefault();
    janela.hide();

    if (!avisouBandeja) {
      avisouBandeja = true;
      notificar(NOME_APP, 'Continuo rodando na bandeja para te lembrar das tarefas. Para sair de vez, clique com o botão direito no ícone e escolha "Sair".');
    }
  });

  // Se o Windows estiver desligando, não atrapalha
  janela.on('session-end', function () {
    saindo = true;
  });
}

// ============================================================
//  Ícone na bandeja (perto do relógio)
// ============================================================
function criarBandeja() {
  bandeja = new Tray(icone);
  bandeja.setToolTip(NOME_APP);
  bandeja.on('click', mostrarJanela);

  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir a Nyx', click: mostrarJanela },
      {
        label: 'Iniciar com o Windows',
        type: 'checkbox',
        checked: iniciaComOWindows(),
        click: (item) => definirInicioComOWindows(item.checked),
      },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ])
  );
}

// ============================================================
//  Notificações do sistema
// ============================================================
function notificar(titulo, corpo) {
  if (!Notification.isSupported()) return;

  const aviso = new Notification({ title: titulo, body: corpo, icon: icone });
  avisosAtivos.add(aviso);
  aviso.on('close', () => avisosAtivos.delete(aviso));
  aviso.on('click', mostrarJanela); // clicar na notificação abre a Nyx
  aviso.show();
}

// A tela (renderer.js) pede, por aqui, para o processo principal notificar
ipcMain.on('notificar', function (_evento, dados) {
  if (!dados || typeof dados.titulo !== 'string' || typeof dados.corpo !== 'string') return;
  notificar(dados.titulo.slice(0, 100), dados.corpo.slice(0, 300));
});

// ============================================================
//  Início do programa
// ============================================================
// Só pode existir UMA Nyx aberta (senão você receberia cada aviso em dobro)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Se você abrir de novo, em vez de abrir outra, mostramos a que já está rodando
  app.on('second-instance', mostrarJanela);

  app.whenReady().then(function () {
    try {
      icone = carregarIcone();
    } catch (erro) {
      // Sem a imagem não dá para continuar: mostra o motivo numa janelinha e fecha
      dialog.showErrorBox('Nyx', erro.message);
      app.exit(1);
      return;
    }

    criarBandeja();
    criarJanela(process.argv.includes('--oculto'));
  });

  app.on('before-quit', function () {
    saindo = true;
  });
}