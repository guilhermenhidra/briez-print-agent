const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { startServer, stopServer, getServerStatus } = require('./server');

// Impedir múltiplas instâncias
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Configurar auto-start com Windows
const AutoLaunch = require('auto-launch');
const autoLauncher = new AutoLaunch({
  name: 'Briez Print Agent',
  path: app.getPath('exe'),
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // Esconder em vez de fechar
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('minimize', () => {
    mainWindow.hide();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Briez Print Agent',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Status do Servidor',
      enabled: false,
      label: getServerStatus().running ? '● Servidor Online (porta 3001)' : '○ Servidor Offline',
    },
    { type: 'separator' },
    {
      label: 'Iniciar com Windows',
      type: 'checkbox',
      checked: false,
      click: async (menuItem) => {
        if (menuItem.checked) {
          await autoLauncher.enable();
        } else {
          await autoLauncher.disable();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Abrir Briez no navegador',
      click: () => {
        shell.openExternal('https://briez.app');
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true;
        stopServer();
        app.quit();
      },
    },
  ]);

  // Atualizar status de auto-launch
  autoLauncher.isEnabled().then((isEnabled) => {
    contextMenu.items[4].checked = isEnabled;
  });

  tray.setToolTip('Briez Print Agent - Online');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// Inicialização do app
app.whenReady().then(async () => {
  // Iniciar servidor HTTP
  await startServer();
  
  // Criar janela e tray
  await createWindow();
  createTray();

  // Iniciar minimizado na bandeja
  if (!process.argv.includes('--dev')) {
    mainWindow.hide();
  } else {
    mainWindow.show();
  }
});

// Segunda instância - mostrar janela existente
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
   // app.quit()
  // Não fechar no Windows, continuar na bandeja
});

app.on('before-quit', () => {
  isQuitting = true;
  stopServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
