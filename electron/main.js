const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let serverInstance = null;
const DEFAULT_PORT = 3000;

async function startProductionServer() {
  const next = require('next');
  const appDir = path.join(__dirname, '..');
  const nextApp = next({ dev: false, dir: appDir });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      handle(req, res);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : DEFAULT_PORT;
      serverInstance = server;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'MetaGen Microstock',
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  let targetUrl = `http://localhost:${DEFAULT_PORT}`;

  if (app.isPackaged) {
    try {
      targetUrl = await startProductionServer();
    } catch (err) {
      console.error('Gagal memulai server internal produksi:', err);
    }
  }

  const loadURL = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(targetUrl).catch(() => {
      setTimeout(loadURL, 1500);
    });
  };

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(loadURL, 1500);
  });

  loadURL();

  // Buka link eksternal di browser default Windows, bukan di jendela Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  if (serverInstance) {
    serverInstance.close();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
