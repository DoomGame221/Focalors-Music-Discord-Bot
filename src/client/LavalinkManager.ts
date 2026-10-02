import { LavalinkManager } from "lavalink-client";
import type { Client, TextChannel } from "discord.js";
import { config } from "../config";
import { logger } from "../utils/logger";
import { buildControllerComponents, buildControllerEmbed } from "../components/controller";
import { controllerUpdater } from "../services/updater";

export function createLavalinkManager(client: Client): LavalinkManager {
  const manager = new LavalinkManager({
    nodes: [
      {
        authorization: config.lavalink.password,
        host: config.lavalink.host,
        port: config.lavalink.port,
        id: "Focalors-Lavalink-Node",
        secure: config.lavalink.secure,
      },
    ],
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard?.send(payload);
    },
    client: {
      id: config.discord.clientId,
      username: "Focalors Music",
    },
    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: (config.bot.defaultSearchPlatform as any) || "ytsearch",
      volumeDecrementer: 1,
      onDisconnect: {
        autoReconnect: true,
        destroyPlayer: false,
      },
      applyVolumeAsFilter: false,
    },
    queueOptions: {
      maxPreviousTracks: 25,
    },
  });

  // Node Events
  manager.nodeManager.on("connect", (node) => {
    logger.success(`Connected to Lavalink node: [${node.id}] (${node.options.host}:${node.options.port})`, "Lavalink");
  });

  manager.nodeManager.on("disconnect", (node, reason) => {
    logger.warn(`Disconnected from Lavalink node [${node.id}]: ${reason}`, "Lavalink");
  });

  manager.nodeManager.on("error", (node, error) => {
    logger.error(`Error on Lavalink node [${node.id}]`, "Lavalink", error);
  });

  // Player & Track Events
  manager.on("trackStart", async (player, track) => {
    logger.info(`Track started: "${track?.info?.title}" in guild [${player.guildId}]`, "Player");

    const channelId = player.textChannelId;
    if (!channelId) return;

    try {
      const channel = await client.channels.fetch(channelId) as TextChannel | null;
      if (!channel || !channel.isTextBased()) return;

      const embed = buildControllerEmbed(player, {
        voiceChannelId: player.voiceChannelId || undefined,
      });
      const components = buildControllerComponents(player);

      const msg = await channel.send({
        embeds: [embed],
        components,
      });

      controllerUpdater.setController(player.guildId, channelId, msg.id);
    } catch (err) {
      logger.error("Failed to send controller message on trackStart", "Player", err);
    }
  });

  manager.on("trackEnd", (player, track) => {
    controllerUpdater.requestUpdate(client, player);
  });

  manager.on("trackError", (player, track, payload) => {
    logger.error(`Track error playing "${track?.info?.title}" in guild [${player.guildId}]: ${JSON.stringify(payload.error || payload)}`, "Player");
  });

  manager.on("queueEnd", async (player) => {
    logger.info(`Queue ended in guild [${player.guildId}]`, "Player");
    controllerUpdater.clear(player.guildId);

    // Check if autoplay is active
    if ((player as any).get?.("autoplay")) {
      const lastTrack = player.queue.previous[0];
      if (lastTrack) {
        logger.info(`Autoplay: finding related tracks for "${lastTrack.info.title}"`, "Player");
        const res = await player.search({
          query: `https://www.youtube.com/watch?v=${lastTrack.info.identifier}&list=RD${lastTrack.info.identifier}`,
          source: "ytsearch",
        }, lastTrack.requester);

        if (res.tracks.length > 0) {
          const nextTrack = res.tracks[Math.floor(Math.random() * Math.min(5, res.tracks.length))];
          if (nextTrack) {
            await player.queue.add(nextTrack);
            await player.play();
            return;
          }
        }
      }
    }

    const channelId = player.textChannelId;
    if (channelId) {
      try {
        const channel = await client.channels.fetch(channelId) as TextChannel | null;
        if (channel && channel.isTextBased()) {
          await channel.send({
            content: "🎶 *The queue has ended. Use `/fm play` to play more songs!*",
          });
        }
      } catch {}
    }
  });

  manager.on("playerDestroy", (player) => {
    logger.info(`Player destroyed in guild [${player.guildId}]`, "Player");
    controllerUpdater.clear(player.guildId);
  });

  return manager;
}
