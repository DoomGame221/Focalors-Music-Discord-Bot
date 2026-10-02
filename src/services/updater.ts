import type { Client, Message, TextChannel } from "discord.js";
import type { Player } from "lavalink-client";
import { buildControllerComponents, buildControllerEmbed } from "../components/controller";
import { logger } from "../utils/logger";

interface ControllerState {
  channelId: string;
  messageId: string;
  lastUpdate: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const controllers = new Map<string, ControllerState>();

const UPDATE_DEBOUNCE_MS = 1500; // Minimum time between embed edits to stay safe from Discord 429

export const controllerUpdater = {
  /**
   * Set or track an active controller message for a guild
   */
  setController(guildId: string, channelId: string, messageId: string): void {
    const existing = controllers.get(guildId);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }
    controllers.set(guildId, {
      channelId,
      messageId,
      lastUpdate: Date.now(),
      timer: null,
    });
  },

  /**
   * Request a debounced update of the controller message
   */
  requestUpdate(client: Client, player: Player): void {
    const guildId = player.guildId;
    const state = controllers.get(guildId);
    if (!state) return;

    if (state.timer) {
      clearTimeout(state.timer);
    }

    const elapsed = Date.now() - state.lastUpdate;
    if (elapsed >= UPDATE_DEBOUNCE_MS) {
      // Execute immediately
      this.executeUpdate(client, player, state);
    } else {
      // Debounce until cooldown expires
      state.timer = setTimeout(() => {
        this.executeUpdate(client, player, state);
      }, UPDATE_DEBOUNCE_MS - elapsed);
    }
  },

  /**
   * Internal method to perform the Discord message edit
   */
  async executeUpdate(client: Client, player: Player, state: ControllerState): Promise<void> {
    state.lastUpdate = Date.now();
    state.timer = null;

    try {
      const channel = await client.channels.fetch(state.channelId) as TextChannel | null;
      if (!channel || !channel.isTextBased()) return;

      const message = await channel.messages.fetch(state.messageId).catch(() => null);
      if (!message) return;

      if (!player.queue.current) {
        // Player has ended
        return;
      }

      const embed = buildControllerEmbed(player);
      const components = buildControllerComponents(player);

      await message.edit({
        embeds: [embed],
        components,
      });
    } catch (err: any) {
      if (err?.code !== 10008) { // Ignore "Unknown Message" error if message was deleted
        logger.warn(`Failed to update controller message in guild ${player.guildId}: ${err?.message || err}`, "Updater");
      }
    }
  },

  /**
   * Clear controller state when player disconnects or stops
   */
  clear(guildId: string): void {
    const state = controllers.get(guildId);
    if (state?.timer) {
      clearTimeout(state.timer);
    }
    controllers.delete(guildId);
  },
};
