# Bande News — Application iOS

Ce dossier contient le projet **Capacitor** pour transformer Bande News en application iOS native.

## Prérequis

- **macOS** avec Xcode installé (nécessaire pour compiler iOS)
- **Node.js** 18+
- Un compte **Apple Developer** (pour déployer sur un vrai appareil ou l'App Store)

## Structure

```
mobile/
  capacitor.config.json    # Configuration Capacitor
  build.js                 # Script qui copie et patch public/ → www/
  www/                     # Assets web générés (copie de public/ + patches)
  ios/                     # Projet Xcode natif
  resources/               # Sources SVG pour icônes et splash screen
```

## Installation

```bash
cd mobile
npm install
```

## Build

Le script `build.js` copie les fichiers de `../public/` vers `www/` et injecte automatiquement la couche Capacitor (détection mobile + redirection des appels API).

```bash
npm run build
```

## Synchronisation iOS

```bash
npx cap sync
```

## Ouvrir dans Xcode

```bash
npx cap open ios
```

Depuis Xcode :
1. Sélectionnez votre **Team** (compte Apple) dans les signing settings
2. Choisissez un **simulateur iPhone** ou branchez un vrai appareil
3. Cliquez sur **▶ Run**

## Configuration de l'API

Par défaut, l'app se connecte à `http://192.168.1.32:3002` (serveur local).

**Pour changer l'URL du serveur :**
- Ouvrez `menu.html` dans l'app
- Renseignez l'URL de votre serveur
- Ou modifiez `API_BASE_URL` dans `www/capacitor-config.js`

## Publication App Store

1. Dans Xcode, sélectionnez **Any iOS Device** comme cible
2. Faites **Product → Archive**
3. Utilisez **Organizer** pour uploader vers App Store Connect
4. Suivez les étapes sur [App Store Connect](https://appstoreconnect.apple.com)

## Personnalisation des assets

Remplacez les fichiers dans `resources/` puis convertissez-les en PNG :

- **Icône** : `resources/icon.svg` → `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- **Splash** : `resources/splash.svg` → `ios/App/App/Assets.xcassets/Splash.imageset/`

Tailles requises pour iOS :
- Icône : 1024×1024 px
- Splash : 2732×2732 px

## Notes

- Le `Info.plist` autorise les connexions HTTP non sécurisées (`NSAllowsArbitraryLoads`) pour le développement local. Avant la publication App Store, configurez un serveur HTTPS ou définissez des exceptions ATS plus restrictives.
- Le status bar est configuré avec le style sombre et la couleur verte `#1a5c2a`.
