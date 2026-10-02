#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "    Focalors Music Bot - Ubuntu Native Setup Script       "
echo "    Engine: @discordjs/voice + yt-dlp + ffmpeg (No Java)  "
echo "=========================================================="

# Check root or sudo
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo:"
  echo "sudo bash scripts/setup-ubuntu.sh"
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Project Directory: $PROJECT_DIR"

echo "[1/6] Installing dependencies (ffmpeg, curl, git)..."
apt-get update -y
apt-get install -y curl unzip git ffmpeg build-essential python3

echo "[2/6] Installing latest yt-dlp binary..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version

echo "[3/6] Installing / Verifying Bun runtime..."
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    cp /root/.bun/bin/bun /usr/local/bin/bun || true
fi
export PATH="/root/.bun/bin:/usr/local/bin:$PATH"
bun --version

echo "[4/6] Decommissioning old Lavalink service (if present)..."
systemctl stop focalors-lavalink 2>/dev/null || true
systemctl disable focalors-lavalink 2>/dev/null || true
rm -f /etc/systemd/system/focalors-lavalink.service
echo "✔ Lavalink service removed successfully."

echo "[5/6] Installing bot node dependencies via Bun..."
cd "$PROJECT_DIR"
bun install

echo "[6/6] Configuring Systemd Service for focalors-bot..."
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

# Setting up global focalors CLI command
chmod +x "$PROJECT_DIR/focalors"
cat << EOF > /usr/local/bin/focalors
#!/usr/bin/env bash
cd "$PROJECT_DIR"
exec bun run "$PROJECT_DIR/src/cli.ts" "\$@"
EOF
chmod +x /usr/local/bin/focalors

if [ -n "$SUDO_USER" ]; then
    chown -R "$SUDO_USER:$SUDO_USER" "$PROJECT_DIR"
fi

echo "=========================================================="
echo " Setup complete! Native audio engine is ready."
echo " Commands:"
echo " 1. Register commands: focalors deploy"
echo " 2. Restart bot:       focalors restart"
echo " 3. Monitor status:    focalors status"
echo " 4. View live logs:    focalors logs"
echo "=========================================================="
