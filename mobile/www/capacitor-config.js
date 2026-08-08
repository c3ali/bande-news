// Configuration auto-générée pour l'app mobile Capacitor
window.API_BASE_URL = window.API_BASE_URL || '';
window.IS_CAPACITOR = typeof Capacitor !== 'undefined';

// Si l'app Capacitor n'a pas d'URL de serveur configurée, on tente localhost
if (window.IS_CAPACITOR && !window.API_BASE_URL) {
  // Mode développement local : le serveur tourne sur le même réseau
  window.API_BASE_URL = 'http://192.168.1.32:3002';
}
