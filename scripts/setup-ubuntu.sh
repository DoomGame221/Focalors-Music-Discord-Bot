#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "    Focalors Music Bot - Ubuntu Server Setup Script       "
echo "=========================================================="

# Check root or sudo
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo:"
  echo "sudo bash scripts/setup-ubuntu.sh"
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Project Directory: $PROJECT_DIR"

echo "[1/6] Updating apt packages and installing essentials..."
apt-get update -y
apt-get install -y curl unzip git ffmpeg openjdk-21-jre-headless build-essential

echo "[2/6] Installing Bun runtime..."
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    # Export bun to global bin
    cp /root/.bun/bin/bun /usr/local/bin/bun || true
fi

# Ensure bun is in PATH
export PATH="/root/.bun/bin:/usr/local/bin:$PATH"

echo "[3/6] Verifying installed runtimes..."
java -version
bun --version
ffmpeg -version | head -n 1

echo "[4/6] Installing bot node_modules via Bun..."
cd "$PROJECT_DIR"
bun install

echo "[5/6] Setting up Lavalink v4.jar..."
mkdir -p "$PROJECT_DIR/lavalink-server"
cd "$PROJECT_DIR/lavalink-server"
if [ ! -f "Lavalink.jar" ]; then
    echo "Downloading latest Lavalink v4..."
    curl -Lo Lavalink.jar https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
fi
cp -f "$PROJECT_DIR/application.yml" ./application.yml
cd "$PROJECT_DIR"

echo "[6/6] Creating Systemd Service files..."
cat << EOF > /etc/systemd/system/focalors-lavalink.service
[Unit]
Description=Lavalink v4 Audio Server for Focalors Music
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR/lavalink-server
ExecStart=/usr/bin/java -Xmx2G -jar Lavalink.jar
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat << EOF > /etc/systemd/system/focalors-bot.service
[Unit]
Description=Focalors Music Discord Bot (Bun Runtime)
After=network.target focalors-lavalink.service

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

echo "[7/7] Setting up global focalors CLI command..."
chmod +x "$PROJECT_DIR/focalors"
cat << EOF > /usr/local/bin/focalors
#!/usr/bin/env bash
cd "$PROJECT_DIR"
exec bun run "$PROJECT_DIR/src/cli.ts" "\$@"
EOF
chmod +x /usr/local/bin/focalors

echo "=========================================================="
echo " Setup complete!"
echo " Next steps:"
echo " 1. Ensure your .env has DISCORD_TOKEN and DISCORD_CLIENT_ID"
echo " 2. Register commands: focalors deploy"
echo " 3. Start Lavalink:    focalors start lavalink"
echo " 4. Start Bot:         focalors start bot"
echo " Monitor everything:   focalors status  (or focalors monitor)"
echo " View live logs:       focalors logs bot"
echo "=========================================================="
