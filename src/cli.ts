import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "./config";
import { getDatabase } from "./database/sqlite";
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
${blue("║")}   🎶 ${bold(magenta("Native Engine: @discordjs/voice + yt-dlp + ffmpeg"))}      ${blue("║")}
${blue("╚═══════════════════════════════════════════════════════════════╝")}
`;

async function checkToolVersion(cmd: string, args: string[]): Promise<string> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = (await new Response(proc.stdout).text()).trim();
    if (output) {
      const firstLine = output.split("\n")[0] || "";
      return green(firstLine.slice(0, 45));
    }
    return green("Installed");
  } catch {
    return red("Not installed / Not found in PATH");
  }
}

function checkCookies(): string {
  const projectRoot = import.meta.dir ? path.resolve(import.meta.dir, "..") : process.cwd();
  const cookiesPath = path.join(projectRoot, "cookies.txt");
  if (existsSync(cookiesPath)) {
    return green("● Present (cookies.txt active)");
  }
  return yellow("○ None (cookies.txt not present)");
}

async function checkServiceStatus(serviceName: string): Promise<string> {
  if (process.platform === "win32") {
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
  console.log("─".repeat(55));

  // Service Status
  const botService = await checkServiceStatus("focalors-bot");
  console.log(`• ${bold("Bot Service (focalors-bot):")}         ${botService}`);
  console.log("");

  // Media Tooling Status
  console.log(bold("🎵 Audio & Streaming Engine:"));
  const ytDlpVer = await checkToolVersion("yt-dlp", ["--version"]);
  const ffmpegVer = await checkToolVersion("ffmpeg", ["-version"]);
  console.log(`• yt-dlp:         ${ytDlpVer}`);
  console.log(`• ffmpeg:         ${ffmpegVer}`);
  console.log(`• YouTube Cookie: ${checkCookies()}`);
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
  console.log("─".repeat(55));
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
    process.stdout.write("\x1B[H");
    console.log(BANNER);
    console.log(`${gray("Timestamp:")} ${cyan(new Date().toLocaleTimeString())}  (Press Ctrl+C to exit)\n`);

    const botService = await checkServiceStatus("focalors-bot");
    console.log(bold("⚙️ Service:"));
    console.log(`• focalors-bot:      ${botService}`);
    console.log(`• YouTube Cookie:   ${checkCookies()}`);

    try {
      const db = getDatabase();
      const playlistCount = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM playlists").get();
      const trackCount = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM playlist_tracks").get();
      console.log("\n" + bold("💾 SQLite Storage:"));
      console.log(`• Playlists:        ${green(playlistCount?.count.toString() || "0")} saved`);
      console.log(`• Cached Tracks:    ${green(trackCount?.count.toString() || "0")} tracks`);
    } catch {}
  };

  await refresh();
  setInterval(refresh, 2000);
}

function showHelp(): void {
  console.log(BANNER);
  console.log(bold("Usage:"));
  console.log("  bun run cli <command> [options]");
  console.log("  or ./focalors <command> [options]");
  console.log("");
  console.log(bold("Available Commands:"));
  console.log(`  ${cyan("status")}              View health and status of bot, yt-dlp, ffmpeg & DB`);
  console.log(`  ${cyan("monitor")}             Launch live auto-refreshing terminal dashboard`);
  console.log(`  ${cyan("start")}               Start focalors-bot service`);
  console.log(`  ${cyan("stop")}                Stop focalors-bot service`);
  console.log(`  ${cyan("restart")}             Restart focalors-bot service`);
  console.log(`  ${cyan("logs")}                View live logs of focalors-bot`);
  console.log(`  ${cyan("db list")}             List all server-side saved playlists`);
  console.log(`  ${cyan("deploy")}              Deploy and register Discord Slash Commands (/fm)`);
  console.log(`  ${cyan("help")}                Show this help message`);
  console.log("");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase() || "status";
  const target = args[1]?.toLowerCase() || "bot";

  switch (command) {
    case "status":
      await showStatus();
      break;

    case "monitor":
    case "dashboard":
      await monitorLive();
      break;

    case "start":
      await runSystemctl("start", "focalors-bot");
      break;

    case "stop":
      await runSystemctl("stop", "focalors-bot");
      break;

    case "restart":
      await runSystemctl("restart", "focalors-bot");
      break;

    case "logs": {
      if (process.platform === "win32") {
        console.log(yellow("Log viewing via journalctl is available on Ubuntu/Linux."));
      } else {
        console.log(`${blue("▶")} Viewing logs for ${bold("focalors-bot")} (Ctrl+C to exit)...`);
        Bun.spawn(["journalctl", "-u", "focalors-bot", "-f", "-n", "100"], {
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
