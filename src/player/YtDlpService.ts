import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { Track, TrackRequester, FilterPreset } from "./types";
import { logger } from "../utils/logger";

export class YtDlpService {
  private static cookiesPath: string | null = null;

  public static init(projectRoot: string): void {
    const candidatePaths = [
      path.join(projectRoot, "cookies.txt"),
      path.join(process.cwd(), "cookies.txt"),
      path.join(process.env.HOME || "", "cookies.txt"),
    ];

    for (const p of candidatePaths) {
      if (existsSync(p)) {
        this.cookiesPath = p;
        logger.success(`Found YouTube cookies at: ${p}`, "YtDlp");
        break;
      }
    }
  }

  private static getBaseArgs(): string[] {
    const args = [
      "--no-warnings",
      "--no-check-certificates",
      "--prefer-free-formats",
      "--ignore-errors",
    ];

    if (!this.cookiesPath || !existsSync(this.cookiesPath)) {
      const candidates = [
        path.join(process.cwd(), "cookies.txt"),
        path.join(process.env.HOME || "", "cookies.txt"),
      ];
      for (const p of candidates) {
        if (p && existsSync(p)) {
          this.cookiesPath = p;
          break;
        }
      }
    }

    if (this.cookiesPath && existsSync(this.cookiesPath)) {
      args.push("--cookies", this.cookiesPath);
    }
    return args;
  }

  /**
   * Search or resolve metadata for a URL or query string
   */
  public static async resolve(
    query: string,
    requester?: TrackRequester
  ): Promise<{ loadType: "track" | "playlist" | "empty" | "error"; tracks: Track[]; playlistName?: string }> {
    const cleanQuery = query.trim();
    const isUrl = /^https?:\/\//i.test(cleanQuery);

    let searchTarget = cleanQuery;
    let isPlaylist = false;

    if (isUrl) {
      if (cleanQuery.includes("list=") || cleanQuery.includes("/playlist/")) {
        isPlaylist = true;
      }
    } else {
      // Search query — search YouTube first
      searchTarget = `ytsearch5:${cleanQuery}`;
    }

    try {
      const args = [
        ...this.getBaseArgs(),
        "--dump-json",
        isPlaylist ? "--flat-playlist" : "--no-playlist",
        searchTarget,
      ];

      const jsonLines = await this.runYtDlp(args);
      if (!jsonLines || jsonLines.trim().length === 0) {
        // If YouTube search yielded nothing, try SoundCloud fallback
        if (!isUrl) {
          logger.info(`YouTube search returned 0 tracks, trying SoundCloud fallback for: "${cleanQuery}"`, "YtDlp");
          const scArgs = [...this.getBaseArgs(), "--dump-json", "--no-playlist", `scsearch5:${cleanQuery}`];
          const scLines = await this.runYtDlp(scArgs);
          if (scLines && scLines.trim().length > 0) {
            return this.parseJsonLines(scLines, requester);
          }
        }
        return { loadType: "empty", tracks: [] };
      }

      return this.parseJsonLines(jsonLines, requester);
    } catch (err: any) {
      logger.error(`Failed to resolve tracks for "${query}": ${err?.message || err}`, "YtDlp");
      return { loadType: "error", tracks: [] };
    }
  }

  private static parseJsonLines(
    output: string,
    requester?: TrackRequester
  ): { loadType: "track" | "playlist" | "empty"; tracks: Track[]; playlistName?: string } {
    const lines = output.trim().split("\n");
    const tracks: Track[] = [];
    let playlistTitle: string | undefined = undefined;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line.trim());
        const id = item.id || item.url || "";
        const title = item.title || "Unknown Title";
        const author = item.uploader || item.artist || item.channel || "Unknown Artist";
        let uri = item.webpage_url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : item.url);
        if (item.id && /^[a-zA-Z0-9_-]{11}$/.test(item.id)) {
          uri = `https://www.youtube.com/watch?v=${item.id}`;
        } else if (uri && (uri.includes("youtube.com") || uri.includes("youtu.be"))) {
          uri = uri.replace(/([?&])list=[^&]+(&|$)/, "$1").replace(/[?&]$/, "");
        }
        const duration = (item.duration ? Math.round(item.duration * 1000) : 0);
        const artworkUrl = item.thumbnail || (item.thumbnails && item.thumbnails[0]?.url) || undefined;

        if (item.playlist_title && !playlistTitle) {
          playlistTitle = item.playlist_title;
        }

        tracks.push({
          info: {
            identifier: id,
            title,
            author,
            uri,
            duration,
            artworkUrl,
          },
          requester,
        });
      } catch {}
    }

    if (tracks.length === 0) {
      return { loadType: "empty", tracks: [] };
    }

    if (tracks.length > 1 && playlistTitle) {
      return { loadType: "playlist", tracks, playlistName: playlistTitle };
    }

    return { loadType: "track", tracks };
  }

  /**
   * Spawns yt-dlp piped into ffmpeg to produce a 48kHz stereo s16le PCM stream
   */
  public static createAudioStream(
    uri: string,
    seekMs: number = 0,
    filter: FilterPreset = "reset"
  ): Readable {
    let cleanUri = uri;
    if (cleanUri.includes("youtube.com") || cleanUri.includes("youtu.be")) {
      cleanUri = cleanUri.replace(/([?&])list=[^&]+(&|$)/, "$1").replace(/[?&]$/, "");
    }

    const ytDlpArgs = [
      ...this.getBaseArgs(),
      "--no-playlist",
      "-f", "bestaudio/best",
      "-o", "-",
      cleanUri,
    ];

    const ytdlp = spawn("yt-dlp", ytDlpArgs, {
      stdio: ["ignore", "pipe", "ignore"],
    });

    const ffmpegArgs: string[] = [
      "-i", "pipe:0",
      "-analyzeduration", "0",
      "-loglevel", "0",
    ];

    if (seekMs > 0) {
      ffmpegArgs.push("-ss", (seekMs / 1000).toFixed(2));
    }

    const filterString = this.getFilterString(filter);
    if (filterString) {
      ffmpegArgs.push("-af", filterString);
    }

    ffmpegArgs.push(
      "-f", "s16le",
      "-ar", "48000",
      "-ac", "2",
      "pipe:1"
    );

    const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["pipe", "pipe", "ignore"],
    });

    ytdlp.stdout.pipe(ffmpeg.stdin);

    ffmpeg.stdin.on("error", () => {});
    ytdlp.stdout.on("error", () => {});

    ytdlp.on("error", (err) => {
      logger.error(`yt-dlp process error: ${err.message}`, "AudioStream");
    });

    ffmpeg.on("error", (err) => {
      logger.error(`ffmpeg process error: ${err.message}`, "AudioStream");
    });

    const cleanup = () => {
      try {
        ytdlp.kill();
      } catch {}
      try {
        ffmpeg.kill();
      } catch {}
    };

    ffmpeg.stdout.on("close", cleanup);
    ffmpeg.stdout.on("end", cleanup);

    return ffmpeg.stdout;
  }

  private static getFilterString(filter: FilterPreset): string | null {
    switch (filter) {
      case "bassboost_high":
      case "filter_bassboost_high":
        return "equalizer=f=60:width_type=h:width=50:g=15,equalizer=f=120:width_type=h:width=50:g=10";
      case "bassboost_med":
      case "filter_bassboost_med":
        return "equalizer=f=60:width_type=h:width=50:g=9,equalizer=f=120:width_type=h:width=50:g=5";
      case "nightcore":
      case "filter_nightcore":
        return "asetrate=48000*1.25,atempo=1.0";
      case "vaporwave":
      case "filter_vaporwave":
        return "asetrate=48000*0.8,atempo=1.0";
      case "8d":
      case "filter_8d":
        return "apulsator=hz=0.125";
      case "pop":
      case "filter_pop":
        return "equalizer=f=1000:width_type=h:width=200:g=4,equalizer=f=3000:width_type=h:width=500:g=5";
      default:
        return null;
    }
  }

  private static runYtDlp(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("yt-dlp", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code) => {
        if (code === 0 || stdout.trim().length > 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });
  }
}
