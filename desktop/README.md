# Bande News — Application Desktop (Windows & Mac)

L'application de bureau **Bande News** utilise **Electron** : elle lance ton serveur
Express actuel (`src/server.js`) en interne et affiche **exactement la même
interface** (`public/index.html`, `collect.html`, `video.html`) dans une fenêtre
native. **Aucun changement de design ni de fonctionnalité** — tout le code du
site web est réutilisé tel quel.

## Utilisation

L'application ouvre directement l'interface habituelle dans la fenêtre :

| Page | Rôle |
|------|------|
| `index.html` / (accueil) | Fil d'actualités MAPNEWS / SNRT, traduction, sauvegarde |
| `collect.html` | Collecte locale + export |
| `video.html` | Suivi de la génération vidéo |

## Développement

```bash
# 1. installer les dépendances (une seule fois)
npm install

# 2. lancer l'app desktop (fenêtre native)
npm run desktop
```

> En dev, si `npm run server` tourne déjà sur le port 3002, l'app s'y connecte
> automatiquement au lieu d'en démarrer un second.

## Générer les installateurs

```bash
# Windows : installeur NSIS + .exe portable  (dist-desktop/)
npm run desktop:build:win

# Mac : fichiers .dmg (Intel + Apple Silicon)   -> à lancer sur un Mac !
npm run desktop:build:mac

# Les deux
npm run desktop:build
```

**Important :** le fichier `.dmg` Mac doit être construit **sur un Mac**
(obligation Apple). Deux options :

1. *Automatique* : le repository contient `.github/workflows/desktop.yml` —
   avec un remote GitHub (`git push` + tag `v1.0.0` ou lancement manuel
   "Build Desktop App" dans l'onglet Actions), GitHub Actions construit
   **l'installeur Windows ET les .dmg Mac** en une fois, téléchargeables
   dans les artefacts du workflow.
2. *Manuelle* : sur n'importe quel Mac, `git clone` le repo puis
   `npm install && npm run desktop:build:mac`.

## Installer (utilisateur final)

- **Windows** : `dist-desktop/Bande News Setup*.exe` (installation en 1 clic,
  par utilisateur — pas besoin d'admin) ou l'`.exe` portable sans installation.
- **Mac** : ouvrir le `.dmg` et glisser **Bande News.app** dans *Applications*.

## Détails techniques

- **Icône** : `desktop/icon.png` (512×512), générée par `scripts/make-icon.mjs`
  (`npm run icon` pour la régénérer). `electron-builder` la convertit en
  `.ico` Windows et `.icns` Mac automatiquement.
- **Données runtime** : `output/` (collectes/exports) et
  `bande-news-video/videos/` sont créés au premier lancement dans le dossier
  de l'app — les videos (2.7 Go) ne sont pas embarquées dans l'installeur.
- **Fenêtre unique** : un second démarrage met la fenêtre déjà ouverte au
  premier plan (verrou d'instance unique).
- **Liens externes** (mapnews.ma, etc.) s'ouvrent dans le navigateur système,
  pas dans l'app.
- **Génération de vidéo** : dans l'app packagée, le générateur est relancé en
  pur Node (`ELECTRON_RUN_AS_NODE`). Comme en dev web, il utilise
  `npx hyperframes` — un Node/npx accessible est donc requis pour cette
  fonctionnalité précise sur les machines sans Node installé.
