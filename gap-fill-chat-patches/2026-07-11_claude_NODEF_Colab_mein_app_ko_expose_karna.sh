cat > /content/setup_vault.sh << 'SETUP_EOF'
#!/bin/bash
set -e

APP_DIR="/content/vault/vault-complete"   # apna actual path yahan confirm kar lena
DATA_DIR="${DATA_DIR:-$APP_DIR}"          # agar media alag folder me hai to yeh badal dena

echo "=== Step 1: Node.js ==="
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "=== Step 2: Install deps ==="
cd "$APP_DIR"
npm install

echo "=== Step 3: Fix vite allowedHosts (avoid 'Blocked request' bug) ==="
sed -i 's/allowedHosts: "all"/allowedHosts: true/' server.ts 2>/dev/null || true
sed -i 's/allowedHosts: "all"/allowedHosts: true/' vite.config.ts 2>/dev/null || true

echo "=== Step 4: Build ==="
npm run build

echo "=== Step 5: cloudflared binary ==="
if [ ! -f /content/cloudflared-linux-amd64 ]; then
  wget -q -O /content/cloudflared-linux-amd64 \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x /content/cloudflared-linux-amd64
fi

echo "=== Step 6: Watchdog scripts ==="
cat > /content/run_server.sh << EOF
#!/bin/bash
cd "$APP_DIR"
export DATA_DIR="$DATA_DIR"
while true; do
  echo "\$(date) — starting server..." >> /content/server.log
  PORT=7860 node dist/server.js >> /content/server.log 2>&1
  echo "\$(date) — server died, restarting in 2s..." >> /content/server.log
  sleep 2
done
EOF
chmod +x /content/run_server.sh

cat > /content/run_tunnel.sh << 'EOF'
#!/bin/bash
while true; do
  echo "$(date) — starting tunnel..." >> /content/cf.log
  /content/cloudflared-linux-amd64 tunnel --url http://localhost:7860 >> /content/cf.log 2>&1
  echo "$(date) — tunnel died, restarting in 2s..." >> /content/cf.log
  sleep 2
done
EOF
chmod +x /content/run_tunnel.sh

echo "=== Step 7: Kill old processes (if any) ==="
pkill -9 -f "node dist/server.js" 2>/dev/null || true
pkill -9 -f cloudflared 2>/dev/null || true
> /content/server.log
> /content/cf.log

echo "=== Step 8: Start everything ==="
nohup /content/run_server.sh > /dev/null 2>&1 &
disown
nohup /content/run_tunnel.sh > /dev/null 2>&1 &
disown

echo "=== Step 9: Wait for tunnel URL ==="
for i in $(seq 1 30); do
  sleep 1
  URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /content/cf.log | tail -1)
  if [ -n "$URL" ]; then
    echo ""
    echo "✅ READY: $URL"
    break
  fi
done

echo ""
echo "Logs: tail -f /content/server.log  |  tail -f /content/cf.log"
SETUP_EOF

chmod +x /content/setup_vault.sh
/content/setup_vault.sh