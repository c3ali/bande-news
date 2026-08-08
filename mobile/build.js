import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'public');
const destDir = join(__dirname, 'www');

// Créer le dossier www
if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

// Fonction de copie récursive
function copyRecursive(src, dest) {
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (!existsSync(destPath)) mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(srcDir, destDir);
console.log('✅ Fichiers copiés de public/ vers www/');

// Créer le fichier de configuration API pour l'app mobile
const configJs = `// Configuration auto-générée pour l'app mobile Capacitor
window.API_BASE_URL = window.API_BASE_URL || '';
window.IS_CAPACITOR = typeof Capacitor !== 'undefined';

// Si l'app Capacitor n'a pas d'URL de serveur configurée, on tente localhost
if (window.IS_CAPACITOR && !window.API_BASE_URL) {
  // Mode développement local : le serveur tourne sur le même réseau
  window.API_BASE_URL = 'http://192.168.1.32:3002';
}
`;
writeFileSync(join(destDir, 'capacitor-config.js'), configJs);
console.log('✅ capacitor-config.js créé');

// Patcher les fichiers HTML pour injecter la config
function injectCapacitorConfig(filePath) {
  let html = readFileSync(filePath, 'utf-8');
  
  // Injecter le script de config juste avant </head>
  const injection = `<script src="capacitor-config.js"></script><script>if(window.IS_CAPACITOR){const _fetch=window.fetch;window.fetch=function(url,opts){if(typeof url==='string'&&url.startsWith('/api/')){url=window.API_BASE_URL+url}return _fetch(url,opts)};}</script>`;
  
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${injection}</head>`);
  }
  
  writeFileSync(filePath, html);
}

for (const file of ['index.html', 'collect.html', 'video.html']) {
  const filePath = join(destDir, file);
  if (existsSync(filePath)) {
    injectCapacitorConfig(filePath);
    console.log(`✅ ${file} patché pour Capacitor`);
  }
}

// Créer un index.html de fallback avec sélection de page
const menuHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Bande News</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0f3d1a, #1a5c2a);
      color: white;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .logo { font-size: 4rem; margin-bottom: 8px; }
    h1 { font-size: 1.8rem; margin-bottom: 4px; }
    .subtitle { opacity: 0.8; margin-bottom: 40px; font-size: 0.95rem; }
    .menu { width: 100%; max-width: 320px; display: flex; flex-direction: column; gap: 14px; }
    .menu-btn {
      display: flex; align-items: center; gap: 14px;
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 16px;
      padding: 18px 20px;
      color: white;
      text-decoration: none;
      font-size: 1.05rem;
      font-weight: 600;
      transition: all 0.2s;
    }
    .menu-btn:hover, .menu-btn:active { background: rgba(255,255,255,0.25); transform: scale(1.02); }
    .menu-btn .icon { font-size: 1.6rem; }
    .menu-btn .label { flex: 1; }
    .menu-btn .arrow { opacity: 0.5; font-size: 1.2rem; }
    .api-config {
      margin-top: 30px;
      width: 100%; max-width: 320px;
      background: rgba(0,0,0,0.2);
      border-radius: 12px;
      padding: 16px;
    }
    .api-config label { display: block; font-size: 0.8rem; opacity: 0.7; margin-bottom: 6px; }
    .api-config input {
      width: 100%; padding: 10px 12px; border-radius: 8px;
      border: none; background: rgba(255,255,255,0.1); color: white; font-size: 0.9rem;
    }
    .api-config input::placeholder { color: rgba(255,255,255,0.4); }
    .save-btn {
      margin-top: 10px; width: 100%; padding: 10px;
      background: white; color: #1a5c2a; border: none; border-radius: 8px;
      font-weight: 700; cursor: pointer;
    }
    .version { margin-top: 30px; font-size: 0.75rem; opacity: 0.4; }
  </style>
  <script src="capacitor-config.js"></script>
</head>
<body>
  <div class="logo">📰</div>
  <h1>باند نيوز</h1>
  <p class="subtitle">Bande News</p>
  
  <div class="menu">
    <a href="index.html" class="menu-btn">
      <span class="icon">📑</span>
      <span class="label">Articles & Traduction</span>
      <span class="arrow">›</span>
    </a>
    <a href="video.html" class="menu-btn">
      <span class="icon">🎬</span>
      <span class="label">Générateur Vidéo</span>
      <span class="arrow">›</span>
    </a>
    <a href="collect.html" class="menu-btn">
      <span class="icon">📥</span>
      <span class="label">Collecte</span>
      <span class="arrow">›</span>
    </a>
  </div>

  <div class="api-config">
    <label>URL du serveur API (laisser vide pour localhost)</label>
    <input type="text" id="apiUrl" placeholder="http://192.168.1.32:3002" />
    <button class="save-btn" onclick="saveApiUrl()">Enregistrer</button>
  </div>

  <p class="version">v1.0.0 — Bande News Mobile</p>

  <script>
    document.getElementById('apiUrl').value = localStorage.getItem('bande_news_api_url') || window.API_BASE_URL || '';
    function saveApiUrl() {
      const url = document.getElementById('apiUrl').value.trim();
      localStorage.setItem('bande_news_api_url', url);
      window.API_BASE_URL = url;
      alert('URL enregistrée : ' + (url || 'localhost'));
    }
  </script>
</body>
</html>`;

writeFileSync(join(destDir, 'menu.html'), menuHtml);
console.log('✅ menu.html créé');

console.log('\n🚀 Build terminé ! Lancez :');
console.log('   cd mobile && npm install && npx cap add ios && npx cap sync');
console.log('   npx cap open ios   # Ouvre Xcode sur Mac');
