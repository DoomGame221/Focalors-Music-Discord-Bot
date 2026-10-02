import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { config } from "./config";
import { getDatabase } from "./database/sqlite";
import { formatDuration } from "./utils/formatters";
import {
  blue,
  green,
  yellow,
  red,
  gray,
  bold,
  cyan,
  magenta,
} from "colorette";

const BANNER = `
${blue("╔═══════════════════════════════════════════════════════════════╗")}
${blue("║")}   💧 ${bold(cyan("FOCALORS MUSIC BOT — Server Administration & CLI"))}      ${blue("║")}
${blue("╚═══════════════════════════════════════════════════════════════╝")}
`;

interface LavalinkStats {
  players: number;
  playingPlayers: number;
  uptime: number;
  memory: {
    free: number;
    used: number;
    allocated: number;
    reservable: number;
  };
  cpu: {
    cores: number;
    systemLoad: number;
    lavalinkLoad: number;
  };
}

interface LavalinkInfo {
  version: {
    semver: string;
    major: number;
    minor: number;
    patch: number;
  };
  jvm: string;
  lavaplayer: string;
  plugins: Array<{ name: string; version: string }>;
}

async function checkLavalinkRest(): Promise<{
  online: boolean;
  info?: LavalinkInfo;
  stats?: LavalinkStats;
  error?: string;
}> {
  const protocol = config.lavalink.secure ? "https" : "http";
  const baseUrl = `${protocol}://${config.lavalink.host}:${config.lavalink.port}`;

  try {
    const infoRes = await fetch(`${baseUrl}/v4/info`, {
      headers: { Authorization: config.lavalink.password },
      signal: AbortSignal.timeout(2500),
    });

    if (!infoRes.ok) {
      return { online: false, error: `HTTP ${infoRes.status} ${infoRes.statusText}` };
    }

    const info = (await infoRes.json()) as LavalinkInfo;

    const statsRes = await fetch(`${baseUrl}/v4/stats`, {
      headers: { Authorization: config.lavalink.password },
      signal: AbortSignal.timeout(2500),
    });

    const stats = statsRes.ok ? ((await statsRes.json()) as LavalinkStats) : undefined;

    return { online: true, info, stats };
  } catch (err: any) {
    return { online: false, error: err?.message || "Connection refused" };
  }
}

async function checkServiceStatus(serviceName: string): Promise<string> {
  if (process.platform === "win32") {
    // Windows check
    return gray("N/A (Windows dev mode)");
  }

  try {
    const proc = Bun.spawn(["systemctl", "is-active", serviceName], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = (await new Response(proc.stdout).text()).trim();
    if (output === "active") return green("● Active (Running)");
    if (output === "inactive") return yellow("○ Inactive (Stopped)");
    if (output === "failed") return red("✖ Failed");
    return gray(`? ${output}`);
  } catch {
    return gray("Systemd not available");
  }
}

async function runSystemctl(action: string, serviceName: string): Promise<void> {
  if (process.platform === "win32") {
    console.log(yellow(`[Warning] Systemctl is only available on Linux/Ubuntu. Current OS: Windows.`));
    return;
  }

  console.log(`${blue("▶")} Running: ${bold(`sudo systemctl ${action} ${serviceName}`)}...`);
  const proc = Bun.spawn(["sudo", "systemctl", action, serviceName]);
  const exitCode = await proc.exited;

  if (exitCode === 0) {
    console.log(green(`✔ Successfully executed ${action} on ${serviceName}!`));
  } else {
    console.log(red(`✖ Failed to ${action} ${serviceName} (exit code ${exitCode})`));
  }
}

async function showStatus(): Promise<void> {
  console.log(BANNER);
  console.log(bold("📊 System & Services Overview:"));
  console.log("─".repeat(50));

  // Service Status
  const botService = await checkServiceStatus("focalors-bot");
  const lavaService = await checkServiceStatus("focalors-lavalink");
  console.log(`• ${bold("Bot Service (focalors-bot):")}         ${botService}`);
  console.log(`• ${bold("Lavalink Service (focalors-lavalink):")} ${lavaService}`);
  console.log("");

  // Lavalink Node Details
  console.log(bold("🔊 Lavalink v4 Audio Engine Status:"));
  console.log(`• Node Address:   ${cyan(`${config.lavalink.host}:${config.lavalink.port}`)}`);
  
  const lava = await checkLavalinkRest();
  if (lava.online && lava.info) {
    console.log(`• Status:         ${green("● Online & Reachable")}`);
    console.log(`• Version:        ${cyan(`Lavalink v${lava.info.version.semver}`)} (JVM: ${lava.info.jvm})`);
    
    if (lava.info.plugins.length > 0) {
      const pluginNames = lava.info.plugins.map((p) => `${p.name} (${p.version})`).join(", ");
      console.log(`• Loaded Plugins: ${yellow(pluginNames)}`);
    }

    if (lava.stats) {
      const memUsedMb = (lava.stats.memory.used / 1024 / 1024).toFixed(1);
      const memAllocMb = (lava.stats.memory.allocated / 1024 / 1024).toFixed(1);
      console.log(`• Uptime:         ${cyan(formatDuration(lava.stats.uptime))}`);
      console.log(`• Memory Usage:   ${cyan(`${memUsedMb} MB / ${memAllocMb} MB`)}`);
      console.log(`• CPU Load:       Lavalink: ${cyan(`${(lava.stats.cpu.lavalinkLoad * 100).toFixed(1)}%`)} | System: ${cyan(`${(lava.stats.cpu.systemLoad * 100).toFixed(1)}%`)} (${lava.stats.cpu.cores} Cores)`);
      console.log(`• Audio Players:  ${green(lava.stats.playingPlayers.toString())} playing / ${cyan(lava.stats.players.toString())} active`);
    }
  } else {
    console.log(`• Status:         ${red("✖ Offline / Unreachable")}`);
    console.log(`• Error Detail:   ${red(lava.error || "Unknown error")}`);
  }
  console.log("");

  // SQLite Database Status
  console.log(bold("💾 SQLite Server-Side Storage:"));
  try {
    const db = getDatabase();
    const playlistCount = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM playlists").get();
    const trackCount = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM playlist_tracks").get();
    console.log(`• Database Path:  ${cyan(config.bot.databasePath)}`);
    console.log(`• Playlists:      ${green(playlistCount?.count.toString() || "0")} playlists saved`);
    console.log(`• Cached Tracks:  ${green(trackCount?.count.toString() || "0")} tracks`);
  } catch (err: any) {
    console.log(`• Database:       ${red(`Error reading database: ${err?.message || err}`)}`);
  }
  console.log("─".repeat(50));
}

async function showDbList(): Promise<void> {
  console.log(BANNER);
  console.log(bold("📂 Server-Side Playlists in SQLite:"));
  console.log("─".repeat(60));

  try {
    const db = getDatabase();
    const rows = db.query<
      { id: number; name: string; user_id: string; track_count: number; updated_at: string },
      []
    >(`
      SELECT p.id, p.name, p.user_id, p.updated_at, COUNT(t.id) as track_count
      FROM playlists p
      LEFT JOIN playlist_tracks t ON p.id = t.playlist_id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all();

    if (rows.length === 0) {
      console.log(gray("No playlists found in database."));
    } else {
      console.log(`${bold("ID".padEnd(5))} | ${bold("Playlist Name".padEnd(25))} | ${bold("Tracks".padEnd(8))} | ${bold("User ID".padEnd(20))} | ${bold("Updated")}`);
      console.log("─".repeat(80));
      for (const r of rows) {
        console.log(`${r.id.toString().padEnd(5)} | ${cyan(r.name.padEnd(25))} | ${green(r.track_count.toString().padEnd(8))} | ${r.user_id.padEnd(20)} | ${gray(r.updated_at)}`);
      }
    }
  } catch (err: any) {
    console.log(red(`Error reading SQLite playlists: ${err?.message || err}`));
  }
  console.log("─".repeat(60));
}

async function monitorLive(): Promise<void> {
  console.clear();
  console.log(BANNER);
  console.log(yellow("Live Monitor Mode — Press Ctrl+C to exit. Refreshing every 2 seconds...\n"));

  const refresh = async () => {
    // Move cursor to home
    process.stdout.write("\x1B[H");
    console.log(BANNER);
    console.log(`${gray("Timestamp:")} ${cyan(new Date().toLocaleTimeString())}  (Press Ctrl+C to exit)\n`);

    const lava = await checkLavalinkRest();
    console.log(bold("🔊 Lavalink v4 Audio Engine:"));
    if (lava.online && lava.stats) {
      console.log(`• Status:         ${green("● ONLINE")} (${config.lavalink.host}:${config.lavalink.port})`);
      console.log(`• Playing Tracks: ${green(lava.stats.playingPlayers.toString())} active / ${cyan(lava.stats.players.toString())} connected`);
      console.log(`• Lavalink Load:  ${cyan(`${(lava.stats.cpu.lavalinkLoad * 100).toFixed(1)}%`)} (System: ${(lava.stats.cpu.systemLoad * 100).toFixed(1)}%)`);
      console.log(`• Memory Used:    ${cyan(`${(lava.stats.memory.used / 1024 / 1024).toFixed(1)} MB`)} / ${(lava.stats.memory.allocated / 1024 / 1024).toFixed(1)} MB`);
      console.log(`• Uptime:         ${cyan(formatDuration(lava.stats.uptime))}`);
    } else {
      console.log(`• Status:         ${red("✖ OFFLINE")} (${lava.error})`);
    }

    console.log("\n" + bold("⚙️ Services:"));
    const botService = await checkServiceStatus("focalors-bot");
    const lavaService = await checkServiceStatus("focalors-lavalink");
    console.log(`• focalors-bot:      ${botService}`);
    console.log(`• focalors-lavalink: ${lavaService}`);
  };

  await refresh();
  setInterval(refresh, 2000);
}

function syncLavalinkConfig(): void {
  const projectRoot = import.meta.dir ? path.resolve(import.meta.dir, "..") : process.cwd();
  const src = path.join(projectRoot, "application.yml");
  const destDir = path.join(projectRoot, "lavalink-server");
  const dest = path.join(destDir, "application.yml");
  if (existsSync(src) && existsSync(destDir)) {
    try {
      copyFileSync(src, dest);
      console.log(green("✔ Synced application.yml to lavalink-server"));
    } catch {
      if (process.platform !== "win32") {
        try {
          Bun.spawnSync(["sudo", "cp", "-f", src, dest]);
          console.log(green("✔ Synced application.yml to lavalink-server (via sudo)"));
        } catch (err: any) {
          console.log(yellow(`[Warning] Could not sync application.yml: ${err?.message || err}`));
        }
      }
    }
  }
}

function showHelp(): void {
  console.log(BANNER);
  console.log(bold("Usage:"));
  console.log("  bun run cli <command> [options]");
  console.log("  or ./focalors <command> [options]");
  console.log("");
  console.log(bold("Available Commands:"));
  console.log(`  ${cyan("status")}              View comprehensive health and status of bot, Lavalink & DB`);
  console.log(`  ${cyan("monitor")}             Launch live auto-refreshing terminal dashboard`);
  console.log(`  ${cyan("start [target]")}       Start service (${gray("bot")}, ${gray("lavalink")}, or ${gray("all")})`);
  console.log(`  ${cyan("stop [target]")}        Stop service (${gray("bot")}, ${gray("lavalink")}, or ${gray("all")})`);
  console.log(`  ${cyan("restart [target]")}     Restart service (${gray("bot")}, ${gray("lavalink")}, or ${gray("all")})`);
  console.log(`  ${cyan("logs [target]")}        View live logs (${gray("bot")} or ${gray("lavalink")})`);
  console.log(`  ${cyan("db list")}             List all server-side saved playlists`);
  console.log(`  ${cyan("deploy")}              Deploy and register Discord Slash Commands (/fm)`);
  console.log(`  ${cyan("help")}                Show this help message`);
  console.log("");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase() || "status";
  const target = args[1]?.toLowerCase() || "all";

  switch (command) {
    case "status":
      await showStatus();
      break;

    case "monitor":
    case "dashboard":
      await monitorLive();
      break;

    case "start":
      if (target === "all" || target === "lavalink") {
        syncLavalinkConfig();
        await runSystemctl("start", "focalors-lavalink");
      }
      if (target === "all" || target === "bot") {
        await runSystemctl("start", "focalors-bot");
      }
      break;

    case "stop":
      if (target === "all" || target === "bot") {
        await runSystemctl("stop", "focalors-bot");
      }
      if (target === "all" || target === "lavalink") {
        await runSystemctl("stop", "focalors-lavalink");
      }
      break;

    case "restart":
      if (target === "all" || target === "lavalink") {
        syncLavalinkConfig();
        await runSystemctl("restart", "focalors-lavalink");
      }
      if (target === "all" || target === "bot") {
        await runSystemctl("restart", "focalors-bot");
      }
      break;

    case "logs": {
      const service = target === "lavalink" ? "focalors-lavalink" : "focalors-bot";
      if (process.platform === "win32") {
        console.log(yellow("Log viewing via journalctl is available on Ubuntu/Linux."));
      } else {
        console.log(`${blue("▶")} Viewing logs for ${bold(service)} (Ctrl+C to exit)...`);
        Bun.spawn(["journalctl", "-u", service, "-f", "-n", "100"], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        });
      }
      break;
    }

    case "db":
      if (target === "list" || !target || target === "all") {
        await showDbList();
      } else {
        console.log(`Unknown db subcommand. Use: ${cyan("bun run cli db list")}`);
      }
      break;

    case "deploy": {
      console.log(`${blue("▶")} Deploying Discord Slash Commands...`);
      const projectRoot = import.meta.dir ? `${import.meta.dir}/..` : process.cwd();
      const proc = Bun.spawn(["bun", "run", "src/deploy-commands.ts"], {
        cwd: projectRoot,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
      break;
    }

    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;

    default:
      console.log(red(`Unknown command: "${command}"`));
      showHelp();
      process.exit(1);
  }
}

main();
