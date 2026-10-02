import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type MessageActionRowComponentBuilder,
  type TextChannel,
} from "discord.js";
import { GuildPlayer } from "./GuildPlayer";
import { YtDlpService } from "./YtDlpService";
import { buildControllerComponents, buildControllerEmbed } from "../components/controller";
import { controllerUpdater } from "../services/updater";
import { config } from "../config";
import { logger } from "../utils/logger";
import type { Track } from "./types";

export class PlayerManager {
  private client: Client;
  public players: Map<string, GuildPlayer> = new Map();
  private updateTicker: ReturnType<typeof setInterval> | null = null;

  constructor(client: Client) {
    this.client = client;
    this.startGlobalUpdateTicker();
  }

  /**
   * Periodically updates playback progress every 4s for active playing players
   */
  private startGlobalUpdateTicker(): void {
    if (this.updateTicker) clearInterval(this.updateTicker);
    this.updateTicker = setInterval(() => {
      for (const [_, player] of this.players) {
        if (player.playing && player.queue.current) {
          controllerUpdater.requestUpdate(this.client, player);
        }
      }
    }, 4000);
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

        const embed = buildControllerEmbed(p, {
          voiceChannelId: p.voiceChannelId || undefined,
        });
        const components = buildControllerComponents(p);

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
      controllerUpdater.requestUpdate(this.client, p);
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

      // Start 5-minute auto-leave timer
      p.startIdleTimer(300000, async () => {
        const chId = p.textChannelId;
        if (chId) {
          try {
            const ch = (await this.client.channels.fetch(chId).catch(() => null)) as TextChannel | null;
            if (ch && ch.isTextBased()) {
              await ch.send("🚪 *บอทออกจากห้องเสียงอัตโนมัติแล้ว เนื่องจากไม่มีการเล่นเพลงภายใน 5 นาที*");
            }
          } catch {}
        }
      });

      const channelId = p.textChannelId;
      if (channelId) {
        try {
          const channel = (await this.client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(config.bot.embedColor)
              .setTitle("🎶 คิวเพลงเล่นจบแล้ว (Queue Ended)")
              .setDescription(
                [
                  "เพลงในคิวเล่นจบทั้งหมดแล้ว บอทได้หยุดเล่นชั่วคราวและยังคงอยู่ในห้องเสียง",
                  "",
                  "⏰ บอทจะออกจากห้องเสียงอัตโนมัติภายใน **5 นาที** หากไม่มีการเปิดเพลงใหม่",
                  "💡 สามารถกดปุ่ม **\"🚪 ให้ออกจากห้องเสียง\"** ด้านล่าง หรือใช้ `/fm leave` เพื่อให้บอทออกทันที",
                ].join("\n")
              );

            const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("idle_leave_voice")
                .setLabel("ให้ออกจากห้องเสียง (Leave Voice)")
                .setEmoji("🚪")
                .setStyle(ButtonStyle.Danger)
            );

            await channel.send({
              embeds: [embed],
              components: [row],
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
