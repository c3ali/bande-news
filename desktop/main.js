import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3002);
const BASE_URL = `http://localhost:${PORT}`;
const ICON_PNG = resolve(__dirname, "icon.png");

let mainWindow = null;
let serverModule = null;

// ---------------------------------------------------------------- Utilitaires
function ping(path = "/api/categories", timeoutMs = 4000) {
  return new Promise((resolveOk) => {
    const req = http.get(`${BASE_URL}${path}`, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolveOk(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("timeout", () => { req.destroy(); resolveOk(false); });
    req.on("error", () => resolveOk(false));
  });
}

async function waitForServer(maxSeconds = 20) {
  const deadline = Date.now() + maxSeconds * 1000;
  while (Date.now() < deadline) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function showErrorAndQuit(title, message) {
  dialog.showErrorBox(title, message);
  app.quit();
}

// ---------------------------------------------------------------- Dossiers runtime
// Repertoires ecrits par l app (collectes, videos) : on les cree de facon
// idempotente pour que toutes les fonctionnalites marchent apres installation.
for (const dir of [
  resolve(ROOT, "output"),
  resolve(ROOT, "bande-news-video"),
  resolve(ROOT, "bande-news-video", "videos"),
]) {
  try { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- Serveur
async function ensureServer() {
  // Cas 1 : un serveur Bande News tourne deja (ex: `npm run server`) -> on s'y connecte
  if (await ping()) return { mode: "existing" };

  // Cas 2 : le port est occupe par autre chose -> message clair
  const free = await new Promise((resolveOk) => {
    const probe = http.createServer();
    probe.once("error", () => resolveOk(false));
    probe.once("listening", () => probe.close(() => resolveOk(true)));
    probe.listen(PORT, "127.0.0.1");
  });
  if (!free) {
    throw new Error(
      `Le port ${PORT} est deja utilise par une autre application.\n` +
      `Fermez cette application puis relancez Bande News.`
    );
  }

  // Cas 3 : on demarre le serveur Express existant dans le processus Electron
  serverModule = await import(pathToFileURL(resolve(ROOT, "src", "server.js")).href);
  const ready = await waitForServer();
  if (!ready) {
    throw new Error("Le serveur interne n'a pas repondu dans les temps.\nRelancez l'application.");
  }
  return { mode: "started" };
}

// ---------------------------------------------------------------- Fenetre
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    title: "Bande News",
    backgroundColor: "#f5f5f0",
    icon: ICON_PNG,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`${BASE_URL}/`);

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });

  // Menu : mac a besoin des roles Edit pour copier/coller ; Windows : pas de barre
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "Fichier",
      submenu: [
        isMac ? { role: "close" } : { role: "quit", label: "Quitter" },
      ],
    },
    { role: "editMenu", label: "Edition" },
    {
      label: "Affichage",
      submenu: [
        { role: "reload", label: "Recharger" },
        { role: "forceReload", label: "Recharger (force)" },
        { role: "toggleDevTools", label: "Outils de developpement" },
        { type: "separator" },
        { role: "resetZoom", label: "Zoom 100%" },
        { role: "zoomIn", label: "Zoom avant" },
        { role: "zoomOut", label: "Zoom arriere" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Plein ecran" },
      ],
    },
    { role: "windowMenu", label: "Fenetre" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // Les liens externes (mapnews.ma, video telechargee, etc.) s'ouvrent dans le navigateur
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !url.startsWith(BASE_URL)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Navigation limitee au serveur local de l'app
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${BASE_URL}/`)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
}

// ---------------------------------------------------------------- Cycle de vie
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await ensureServer();
    } catch (err) {
      showErrorAndQuit("Bande News - Erreur au demarrage", String(err?.message || err));
      return;
    }
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
