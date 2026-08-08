const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const WWW_DIR = path.join(__dirname, 'mobile', 'www');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(WWW_DIR, req.url === '/' ? '/pwa.html' : req.url);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Fichier non trouvé');
      } else {
        res.writeHead(500);
        res.end('Erreur serveur');
      }
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🚀 Serveur Bande News lancé !`);
  console.log(`\n  ➜  Ouvre ce lien sur ton iPhone :`);
  console.log(`     http://192.168.1.32:${PORT}/pwa.html`);
  console.log(`\n  ➜  Ou sur ce PC :`);
  console.log(`     http://localhost:${PORT}/pwa.html`);
  console.log(`\n  📱 Sur iPhone : ouvre Safari → Partager → Ajouter à l'écran d'accueil`);
  console.log(`\n  ❌ Appuie sur Ctrl+C pour arrêter le serveur\n`);
});
