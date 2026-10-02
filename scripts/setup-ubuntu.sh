#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "    💧 Focalors Music Bot - Complete Ubuntu Setup        "
echo "    Engine: @discordjs/voice + yt-dlp + ffmpeg            "
echo "=========================================================="

# Check root or sudo
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo:"
  echo "sudo bash scripts/setup-ubuntu.sh"
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Project Directory: $PROJECT_DIR"

echo "[1/8] Installing OS dependencies (ffmpeg, curl, git, python3)..."
apt-get update -y
apt-get install -y curl unzip git ffmpeg build-essential python3

echo "[2/8] Installing latest yt-dlp binary..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version

echo "[3/8] Installing / Verifying Bun runtime..."
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    cp /root/.bun/bin/bun /usr/local/bin/bun || true
fi
export PATH="/root/.bun/bin:/usr/local/bin:$PATH"
bun --version

echo "[4/8] Decommissioning old Lavalink service (if present)..."
systemctl stop focalors-lavalink 2>/dev/null || true
systemctl disable focalors-lavalink 2>/dev/null || true
rm -f /etc/systemd/system/focalors-lavalink.service
echo "✔ Lavalink service removed successfully."

echo "[5/8] Installing bot dependencies via Bun..."
cd "$PROJECT_DIR"
bun install

echo "[6/8] Configuring Systemd Service for focalors-bot..."
cat << EOF > /etc/systemd/system/focalors-bot.service
[Unit]
Description=Focalors Music Discord Bot (Bun Runtime)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR
EnvironmentFile=$PROJECT_DIR/.env
ExecStart=/usr/local/bin/bun run src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable focalors-bot

# Set up global focalors CLI command
chmod +x "$PROJECT_DIR/focalors" 2>/dev/null || true
cat << EOF > /usr/local/bin/focalors
#!/usr/bin/env bash
cd "$PROJECT_DIR"
exec bun run "$PROJECT_DIR/src/cli.ts" "\$@"
EOF
chmod +x /usr/local/bin/focalors

if [ -n "$SUDO_USER" ]; then
    chown -R "$SUDO_USER:$SUDO_USER" "$PROJECT_DIR"
fi

echo "[7/8] Deploying Discord Slash Commands (/fm)..."
if [ -f "$PROJECT_DIR/.env" ]; then
    bun run src/deploy-commands.ts || echo "⚠️ Could not deploy commands automatically. Run 'focalors deploy' later."
else
    echo "⚠️ .env file not found yet. Please create .env with DISCORD_TOKEN before deploying commands."
fi

echo "[8/8] Starting / Restarting focalors-bot service..."
systemctl restart focalors-bot
sleep 2

echo "=========================================================="
echo " ✔ Complete setup finished! Focalors is active & running! "
echo "=========================================================="
focalors status || true
echo ""
echo "Helpful commands:"
echo " • View live logs:     focalors logs"
echo " • Monitor bot:        focalors monitor"
echo " • Restart service:    focalors restart"
echo "=========================================================="
