#!/usr/bin/env bash
set -euo pipefail

SERVER_USER="amr02"
SERVER_HOST="129.121.119.46"
REMOTE_DIR="~/apps/ehsebhaly"
SSH_KEY="${HOME}/.ssh/ehsebhaly_deploy"

echo "🚀 Starting deployment of احسبهالي (Ehsebhaly) to ${SERVER_USER}@${SERVER_HOST}..."

SSH_OPTS="-o StrictHostKeyChecking=accept-new"
if [ -f "${SSH_KEY}" ]; then
  SSH_OPTS="${SSH_OPTS} -i ${SSH_KEY}"
fi

ssh ${SSH_OPTS} "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${REMOTE_DIR}"

echo "📦 Syncing files to server..."
rsync -avz --delete \
  -e "ssh ${SSH_OPTS}" \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  ./ "${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}/"

echo "🔨 Installing dependencies, building Next.js, and restarting PM2 on server..."
ssh ${SSH_OPTS} "${SERVER_USER}@${SERVER_HOST}" << 'EOF'
  set -e
  cd ~/apps/ehsebhaly
  npm install --prefer-offline --no-audit
  npm run build
  if command -v pm2 >/dev/null 2>&1; then
    pm2 startOrReload ecosystem.config.cjs --update-env
    pm2 save
  else
    npx pm2 startOrReload ecosystem.config.cjs --update-env
  fi
  echo "✅ Deployment complete! App running on port 3005."
EOF
