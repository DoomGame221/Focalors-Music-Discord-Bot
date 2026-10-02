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

echo "[1/5] Updating packages and installing essentials..."
apt-get update -y
apt-get install -y curl unzip git ffmpeg openjdk-21-jre-headless

echo "[2/5] Installing Bun runtime..."
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    # Export bun to global bin
    cp /root/.bun/bin/bun /usr/local/bin/bun || true
fi

echo "[3/5] Verifying installed runtimes..."
java -version
bun --version
ffmpeg -version | head -n 1

echo "[4/5] Downloading Lavalink v4.jar..."
mkdir -p lavalink-server
cd lavalink-server
if [ ! -f "Lavalink.jar" ]; then
    echo "Downloading latest Lavalink v4..."
    curl -Lo Lavalink.jar https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
fi
if [ ! -f "application.yml" ]; then
    cp ../application.yml ./application.yml || true
fi
cd ..

echo "[5/5] Creating Systemd Service templates..."
cat << 'EOF' > /etc/systemd/system/focalors-lavalink.service
[Unit]
Description=Lavalink v4 Audio Server for Focalors Music
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/Focalors-Music-Discord-Bot/lavalink-server
ExecStart=/usr/bin/java -Xmx2G -jar Lavalink.jar
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat << 'EOF' > /etc/systemd/system/focalors-bot.service
[Unit]
Description=Focalors Music Discord Bot (Bun Runtime)
After=network.target focalors-lavalink.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/Focalors-Music-Discord-Bot
EnvironmentFile=/opt/Focalors-Music-Discord-Bot/.env
ExecStart=/usr/local/bin/bun run src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo "=========================================================="
echo " Setup complete!"
echo " Next steps:"
echo " 1. Configure .env with your DISCORD_TOKEN and DISCORD_CLIENT_ID"
echo " 2. Run 'bun install'"
echo " 3. Start Lavalink: sudo systemctl start focalors-lavalink"
echo " 4. Start Bot:      sudo systemctl start focalors-bot"
echo " Or test manually:  bun run src/index.ts"
echo "=========================================================="
