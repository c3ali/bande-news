# Bande News — Application iOS

Application iOS native créée avec **Capacitor**. Le téléphone peut fonctionner de 3 manières :

| Mode | Besoin serveur | Fonctionnalités |
|------|---------------|-----------------|
| **📡 Autonome** | ❌ Aucun | Scrape directement les sites, traduit via API, tout sur le téléphone |
| **📴 Hors Ligne** | ❌ Aucun | Saisie manuelle, traduction API, stockage local |
| **🌐 Avec serveur** | ✅ Backend requis | Collecte serveur + vidéo + collecte bookmarklet |

## Prérequis

- **macOS** avec Xcode installé
- **Node.js** 18+
- Compte **Apple Developer** (pour déployer sur appareil/App Store)

## Structure

```
mobile/
  capacitor.config.json      # Configuration Capacitor
  build.js                   # Script de build public/ → www/
  standalone.html            # 📡 Mode autonome (scraping direct)
  offline.html               # 📴 Mode hors ligne (saisie manuelle)
  www/                       # Assets générés pour l'app
  ios/                       # Projet Xcode natif
  resources/                 # Icône & splash SVG
```

## Installation & Build

```bash
cd mobile
npm install
npm run build          # Génère www/ depuis public/ + standalone + offline
npx cap sync           # Synchronise avec le projet iOS
npx cap open ios       # Ouvre Xcode
```

Dans Xcode :
1. Sélectionnez votre **Team** Apple
2. Lancez sur simulateur ou appareil

## Les 3 modes

### 📡 Mode Autonome (recommandé)

**Aucun serveur requis.** Le téléphone fait directement :
- Les requêtes à `mapnews.ma` et `SNRTnews` (via proxies CORS)
- Les appels à l'API NanoGPT pour la traduction
- Le stockage dans `localStorage`
- L'export JSON/TXT

Depuis le menu principal → **Mode Autonome**

**Configuration nécessaire :**
- Clé API NanoGPT (dans l'onglet Config)

### 📴 Mode Hors Ligne

**Sans aucune connexion internet** (sauf pour la traduction).

- Saisie manuelle des titres arabes
- Traduction FR/EN via API
- Import/export JSON

Depuis le menu principal → **Mode Hors Ligne**

### 🌐 Mode Serveur

Se connecte à un backend Node.js (local ou cloud).

Depuis le menu principal → renseignez l'URL du serveur.

**Déploiement cloud :**
- Le projet inclut un `Dockerfile` et `render.yaml`
- Déployez sur [Render.com](https://render.com) gratuitement
- Copiez l'URL dans l'app

## Publication App Store

1. Xcode → **Any iOS Device**
2. **Product → Archive**
3. **Organizer → Distribute App**
4. Suivez les étapes sur [App Store Connect](https://appstoreconnect.apple.com)

## Notes techniques

- `NSAllowsArbitraryLoads` est activé dans `Info.plist` pour le développement
- Le plugin `@capacitor-community/http` est inclus pour les requêtes natives (contourne CORS sur iOS)
- Les proxys CORS publics (`allorigins.win`, `codetabs.com`) sont utilisés comme fallback

## Personnalisation des assets

Convertissez les SVG en PNG aux tailles iOS requises :
- **Icône** : 1024×1024 px → `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- **Splash** : 2732×2732 px → `ios/App/App/Assets.xcassets/Splash.imageset/`
