#!/bin/bash

PORT=8080
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Vérifie si le port est déjà utilisé
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Le port $PORT est déjà utilisé."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installation des dépendances..."
  npm install --silent
fi

echo "Démarrage du serveur sur http://localhost:$PORT"
xdg-open "http://localhost:$PORT" &

PORT=$PORT node server.js
