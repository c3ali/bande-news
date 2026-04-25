@echo off
chcp 65001 >nul
echo.
echo ══════════════════════════════════════════════════════════════
echo   📰 BANDE NEWS — Collecte locale + push serveur
echo ══════════════════════════════════════════════════════════════
echo.

if "%REMOTE_URL%"=="" (
  echo ⚠️  REMOTE_URL n'est pas défini.
  echo.
  echo   set REMOTE_URL=https://votre-serveur.dokploy.com
  echo   collect.bat
  echo.
  set /p REMOTE_URL="Entrez l'URL de votre serveur Dokploy : "
)

echo 📡 Serveur : %REMOTE_URL%
echo.
set REMOTE_URL=%REMOTE_URL%
node src/scrape-and-push.js
echo.
pause
