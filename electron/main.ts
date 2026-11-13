import fs from 'node:fs';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

// Ensure single running desktop instance so SQLite & background scheduler don't collide
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId('com.ytautopost.studio');

// Point backend storage to user's local AppData folder (or dev data/ when unpackaged if preferred? No, userData is clean & persistent on Windows!)
const desktopDataDir = app.isPackaged
  ? path.join(app.getPath('userData'), 'data')
  : path.join(APP_ROOT, 'data');

process.env.YT_AUTOPOST_DESKTOP = '1';
process.env.YT_AUTOPOST_DATA_DIR = desktopDataDir;
process.env.YT_AUTOPOST_CLIENT_DIST = path.join(APP_ROOT, 'dist');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let httpServer: http.Server | null = null;
let stopWorkerFn: (() => void) | null = null;
let isQuitting = false;
let shownTrayHint = false;

const desktopPrefsFile = path.join(desktopDataDir, 'desktop-prefs.json');

function loadDesktopPrefs(): { minimizeToTray: boolean } {
  try {
    if (fs.existsSync(desktopPrefsFile)) {
      const parsed = JSON.parse(fs.readFileSync(desktopPrefsFile, 'utf8'));
      return { minimizeToTray: parsed.minimizeToTray !== false };
    }
  } catch {
    // ignore
  }
  return { minimizeToTray: true };
}

function saveDesktopPrefs(prefs: { minimizeToTray: boolean }): void {
  fs.mkdirSync(desktopDataDir, { recursive: true });
  fs.writeFileSync(desktopPrefsFile, JSON.stringify(prefs, null, 2), 'utf8');
}

function getIconPath(): string {
  const ico = path.join(APP_ROOT, 'electron', 'assets', 'icon.ico');
  const png = path.join(APP_ROOT, 'electron', 'assets', 'icon.png');
  return fs.existsSync(ico) ? ico : png;
}

function focusMainWindow(): void {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createTray(): void {
  if (tray) return;
  const icon = nativeImage.createFromPath(getIconPath());
  tray = new Tray(icon);
  tray.setToolTip('YT AutoPost Studio — Автопостинг YouTube');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Відкрити YT AutoPost Studio',
      click: () => focusMainWindow(),
    },
    {
      label: 'Відкрити папку даних',
      click: () => void shell.openPath(desktopDataDir),
    },
    { type: 'separator' },
    {
      label: 'Вийти повністю',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => focusMainWindow());
}

async function startLocalBackend(): Promise<number> {
  const serverDir = path.join(APP_ROOT, 'dist-server');
  const appMod = (await import(pathToFileURL(path.join(serverDir, 'app.js')).href)) as {
    createApp: () => import('express').Express;
  };
  const cfgMod = (await import(pathToFileURL(path.join(serverDir, 'config.js')).href)) as {
    config: {
      port: number;
      onOAuthCompleted: null | ((payload: { ok: boolean; channelTitle?: string; error?: string }) => void);
    };
    setRuntimePort: (port: number) => void;
  };
  const workerMod = (await import(pathToFileURL(path.join(serverDir, 'worker.js')).href)) as {
    startBackgroundWorker: () => void;
    stopBackgroundWorker: () => void;
  };

  stopWorkerFn = workerMod.stopBackgroundWorker;
  cfgMod.config.onOAuthCompleted = (payload) => {
    focusMainWindow();
    mainWindow?.webContents.send('desktop:oauth-completed', payload);
  };

  const expressApp = appMod.createApp();

  const listenOn = (port: number) =>
    new Promise<http.Server>((resolve, reject) => {
      const s = expressApp.listen(port, '127.0.0.1', () => resolve(s));
      s.once('error', reject);
    });

  try {
    httpServer = await listenOn(cfgMod.config.port);
  } catch {
    // Fallback to any available loopback port if default port is occupied
    httpServer = await listenOn(0);
  }

  const actualPort = (httpServer.address() as AddressInfo).port;
  cfgMod.setRuntimePort(actualPort);
  workerMod.startBackgroundWorker();
  return actualPort;
}

function createWindow(targetUrl: string): void {
  const preloadPath = path.join(APP_ROOT, 'electron', 'preload.cjs');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 680,
    title: 'YT AutoPost Studio',
    backgroundColor: '#020617',
    icon: getIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    const current = new URL(mainWindow!.webContents.getURL() || targetUrl);
    if (parsed.origin !== current.origin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on('close', (event) => {
    const prefs = loadDesktopPrefs();
    if (!isQuitting && prefs.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
      if (!shownTrayHint && tray) {
        shownTrayHint = true;
        tray.displayBalloon({
          title: 'YT AutoPost Studio',
          content: 'Програма згорнута в трей і продовжує автоматичні публікації за розкладом.',
        });
      }
    }
  });

  void mainWindow.loadURL(targetUrl);
}

function registerIpcHandlers(): void {
  ipcMain.handle('desktop:pick-video', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Оберіть відеофайл',
      properties: ['openFile'],
      filters: [
        { name: 'Відеофайли', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] },
        { name: 'Усі файли', extensions: ['*'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stat.size,
    };
  });

  ipcMain.handle('desktop:pick-thumbnail', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Оберіть прев’ю (обкладинку)',
      properties: ['openFile'],
      filters: [
        { name: 'Зображення', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
        { name: 'Усі файли', extensions: ['*'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stat.size,
    };
  });

  ipcMain.handle('desktop:open-external', async (_evt, url: string) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('desktop:open-data-dir', async () => {
    await shell.openPath(desktopDataDir);
  });

  ipcMain.handle('desktop:get-settings', () => {
    const prefs = loadDesktopPrefs();
    return {
      minimizeToTray: prefs.minimizeToTray,
      dataDir: desktopDataDir,
      version: app.getVersion(),
    };
  });

  ipcMain.handle('desktop:set-minimize-to-tray', (_evt, enabled: boolean) => {
    saveDesktopPrefs({ minimizeToTray: Boolean(enabled) });
  });
}

app.on('second-instance', () => {
  focusMainWindow();
});

app.whenReady().then(async () => {
  try {
    const port = await startLocalBackend();
    registerIpcHandlers();
    createTray();

    const devUrl = process.env.VITE_DEV_SERVER_URL?.trim();
    const uiUrl = devUrl || `http://127.0.0.1:${port}`;
    createWindow(uiUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.stack || err.message : String(err);
    dialog.showErrorBox('Помилка запуску YT AutoPost Studio', msg);
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopWorkerFn?.();
  httpServer?.close();
});

app.on('window-all-closed', () => {
  const prefs = loadDesktopPrefs();
  if (!prefs.minimizeToTray && process.platform !== 'darwin') {
    app.quit();
  }
});
