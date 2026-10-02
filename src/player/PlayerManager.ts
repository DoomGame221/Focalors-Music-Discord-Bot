import type { Client, TextChannel } from "discord.js";
import { GuildPlayer } from "./GuildPlayer";
import { YtDlpService } from "./YtDlpService";
import { buildControllerComponents, buildControllerEmbed } from "../components/controller";
import { controllerUpdater } from "../services/updater";
import { logger } from "../utils/logger";
import type { Track } from "./types";

export class PlayerManager {
  private client: Client;
  public players: Map<string, GuildPlayer> = new Map();

  constructor(client: Client) {
    this.client = client;
  }

  public getPlayer(guildId: string): GuildPlayer | undefined {
    return this.players.get(guildId);
  }

  public createPlayer(guildId: string, textChannelId?: string): GuildPlayer {
    let player = this.players.get(guildId);
    if (player) {
      if (textChannelId) player.textChannelId = textChannelId;
      return player;
    }

    player = new GuildPlayer(guildId, textChannelId);
    this.players.set(guildId, player);
    this.setupPlayerEvents(player);
    return player;
  }

  public destroyPlayer(guildId: string, reason?: string): void {
    const player = this.players.get(guildId);
    if (player) {
      player.destroy(reason);
      this.players.delete(guildId);
    }
  }

  private setupPlayerEvents(player: GuildPlayer): void {
    player.on("trackStart", async (p: GuildPlayer, track: Track) => {
      logger.info(`Track started: "${track?.info?.title}" in guild [${p.guildId}]`, "Player");

      const channelId = p.textChannelId;
      if (!channelId) return;

      try {
        const channel = (await this.client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
        if (!channel || !channel.isTextBased()) return;

        const embed = buildControllerEmbed(p as any, {
          voiceChannelId: p.voiceChannelId || undefined,
        });
        const components = buildControllerComponents(p as any);

        await controllerUpdater.deleteOldController(this.client, p.guildId);

        const msg = await channel.send({
          embeds: [embed],
          components,
        });

        controllerUpdater.setController(p.guildId, channelId, msg.id);
      } catch (err) {
        logger.error("Failed to send controller message on trackStart", "Player", err);
      }
    });

    player.on("trackEnd", (p: GuildPlayer, track: Track) => {
      logger.info(`Track ended: "${track?.info?.title}" in guild [${p.guildId}]`, "Player");
      controllerUpdater.requestUpdate(this.client, p as any);
    });

    player.on("trackError", async (p: GuildPlayer, track: Track, err: any) => {
      logger.error(`Track error playing "${track?.info?.title}" in guild [${p.guildId}]: ${err?.message || err}`, "Player");

      const channelId = p.textChannelId;
      if (channelId) {
        try {
          const channel = (await this.client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
          if (channel && channel.isTextBased()) {
            await channel.send({
              content: `⚠️ **ไม่สามารถเล่นเพลงนี้ได้:** ${track?.info?.title ? `*${track.info.title}*` : ""}\n> \`${err?.message || err}\``,
            });
          }
        } catch {}
      }
    });

    player.on("queueEnd", async (p: GuildPlayer) => {
      logger.info(`Queue ended in guild [${p.guildId}]`, "Player");
      await controllerUpdater.deleteOldController(this.client, p.guildId);
      controllerUpdater.clear(p.guildId);

      // Autoplay handler
      if (p.get("autoplay")) {
        const lastTrack = p.queue.previous[0];
        if (lastTrack) {
          logger.info(`Autoplay: finding related tracks for "${lastTrack.info.title}"`, "Player");
          const res = await YtDlpService.resolve(
            `ytsearch5:${lastTrack.info.author} ${lastTrack.info.title}`,
            lastTrack.requester
          );

          if (res.tracks.length > 0) {
            const nextTrack = res.tracks[Math.floor(Math.random() * Math.min(3, res.tracks.length))];
            if (nextTrack) {
              p.queue.add(nextTrack);
              await p.play();
              return;
            }
          }
        }
      }

      const channelId = p.textChannelId;
      if (channelId) {
        try {
          const channel = (await this.client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
          if (channel && channel.isTextBased()) {
            await channel.send({
              content: "🎶 *The queue has ended. Use `/fm play` to play more songs!*",
            });
          }
        } catch {}
      }
    });

    player.on("playerDestroy", async (p: GuildPlayer) => {
      this.players.delete(p.guildId);
      await controllerUpdater.deleteOldController(this.client, p.guildId);
      controllerUpdater.clear(p.guildId);
    });
  }
}
