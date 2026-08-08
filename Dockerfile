# Bande News — Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json ./
RUN npm install --production

# Copier le code source
COPY src/ ./src/
COPY public/ ./public/
COPY config.json ./

# Créer le dossier output
RUN mkdir -p output

# Port exposé
EXPOSE 3002

# Démarrer le serveur
CMD ["node", "src/server.js"]
