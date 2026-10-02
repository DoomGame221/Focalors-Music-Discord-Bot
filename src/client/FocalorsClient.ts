import {
  Client,
  GatewayIntentBits,
  type Interaction,
  GuildMember,
  TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
} from "discord.js";
import type { LavalinkManager, Player } from "lavalink-client";
import { createLavalinkManager } from "./LavalinkManager";
import { fmCommand, applyFilterPreset } from "../commands/fm";
import { buildQueueMenu } from "../components/queueMenu";
import { buildFilterMenu } from "../components/filterMenu";
import { controllerUpdater } from "../services/updater";
import { playlistRepo } from "../database/playlistRepo";
import { logger } from "../utils/logger";
import { config } from "../config";
import { escapeMarkdown } from "../utils/formatters";

export class FocalorsClient extends Client {
  public lavalink: LavalinkManager;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.lavalink = createLavalinkManager(this);

    // Forward raw Discord events to Lavalink (required for voice state updates)
    this.on("raw", (d) => this.lavalink.sendRawData(d));

    // Handle interactions (Slash commands, buttons, dropdowns, modals)
    this.on("interactionCreate", this.handleInteraction.bind(this));
  }

  public async start(): Promise<void> {
    this.once("ready", async () => {
      logger.focalors(`Focalors Music Bot is online as [${this.user?.tag}]!`);
      // Initialize Lavalink with bot user credentials
      await this.lavalink.init({
        id: this.user!.id,
        username: this.user!.username,
      });
    });

    await this.login(config.discord.token);
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "fm") {
          await fmCommand.execute(interaction, this);
        }
      } else if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await this.handleSelectMenuInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModalSubmit(interaction);
      }
    } catch (err: any) {
      logger.error("Interaction handling error", "Client", err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ An unexpected error occurred: ${err?.message || err}`,
          ephemeral: true,
        }).catch(() => {});
      }
    }
  }

  private async handleButtonInteraction(interaction: any): Promise<void> {
    const customId: string = interaction.customId;
    const guildId = interaction.guildId!;
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    const player = this.lavalink.getPlayer(guildId);

    // Queue pagination buttons (doesn't require voice channel)
    if (customId.startsWith("queue_page_")) {
      const page = parseInt(customId.replace("queue_page_", ""), 10);
      if (player) {
        const menu = buildQueueMenu(player, page);
        await interaction.update({ embeds: [menu.embed], components: menu.components });
      } else {
        await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
      }
      return;
    }

    if (customId === "queue_refresh") {
      if (player) {
        const menu = buildQueueMenu(player, 1);
        await interaction.update({ embeds: [menu.embed], components: menu.components });
      } else {
        await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
      }
      return;
    }

    // Controls require voice channel
    if (!voiceChannel) {
      await interaction.reply({
        content: "❌ You must be in a Voice Channel to use playback controls!",
        ephemeral: true,
      });
      return;
    }

    if (!player) {
      await interaction.reply({ content: "❌ No active player found in this server!", ephemeral: true });
      return;
    }

    // Defer update immediately to feel instantaneous
    await interaction.deferUpdate();

    switch (customId) {
      case "ctrl_prev": {
        const prevTrack = player.queue.previous.shift();
        if (prevTrack) {
          if (player.queue.current) {
            player.queue.tracks.unshift(player.queue.current);
          }
          await player.play({ track: prevTrack });
          controllerUpdater.requestUpdate(this, player);
        }
        break;
      }
      case "ctrl_rewind": {
        const currentPos = player.position || 0;
        await player.seek(Math.max(0, currentPos - 10000));
        controllerUpdater.requestUpdate(this, player);
        break;
      }
      case "ctrl_playpause": {
        if (player.paused) {
          await player.resume();
        } else {
          await player.pause();
        }
        controllerUpdater.requestUpdate(this, player);
        break;
      }
      case "ctrl_forward": {
        const currentPos = player.position || 0;
        const duration = player.queue.current?.info?.duration || 0;
        await player.seek(Math.min(duration, currentPos + 10000));
        controllerUpdater.requestUpdate(this, player);
        break;
      }
      case "ctrl_skip": {
        await player.skip();
        controllerUpdater.requestUpdate(this, player);
        break;
      }
      case "ctrl_voldown": {
        const newVol = Math.max(10, player.volume - 10);
        await player.setVolume(newVol);
        controllerUpdater.requestUpdate(this, player);
        break;
      }
      case "ctrl_volup": {
        const newVol = Math.min(150, player.volume + 10);
        await player.setVolume(newVol);
        controllerUpdater.requestUpdate(this, player);
        break;
      }
      case "ctrl_loop": {
        const nextMode =
          player.repeatMode === "off" ? "track" : player.repeatMode === "track" ? "queue" : "off";
        await player.setRepeatMode(nextMode);
        controllerUpdater.requestUpdate(this, player);
        break;
      }
      case "ctrl_shuffle": {
        if (player.queue.tracks.length > 0) {
          await player.queue.shuffle();
          controllerUpdater.requestUpdate(this, player);
        }
        break;
      }
      case "ctrl_stop": {
        await player.destroy("Controller stop button");
        controllerUpdater.clear(guildId);
        break;
      }
      case "ctrl_queuelist": {
        const menu = buildQueueMenu(player, 1);
        await interaction.followUp({
          embeds: [menu.embed],
          components: menu.components,
          ephemeral: true,
        });
        break;
      }
      case "ctrl_filters": {
        const menu = buildFilterMenu(player);
        await interaction.followUp({
          embeds: [menu.embed],
          components: menu.components,
          ephemeral: true,
        });
        break;
      }
      case "ctrl_autoplay": {
        const isAutoplay = (player as any).get?.("autoplay");
        (player as any).set?.("autoplay", !isAutoplay);
        controllerUpdater.requestUpdate(this, player);
        break;
      }
      case "ctrl_saveplaylist": {
        // Show modal for saving playlist
        const modal = new ModalBuilder()
          .setCustomId("modal_save_playlist")
          .setTitle("💾 Save Current Queue to Playlist");

        const nameInput = new TextInputBuilder()
          .setCustomId("playlist_name_input")
          .setLabel("Playlist Name")
          .setPlaceholder("e.g. My Favorite Chill Songs")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(50)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
        // Note: For modal, cannot be after deferUpdate, so handle in interaction
        await interaction.followUp({
          content: "To save the playlist, please use the command: `/fm playlist save <name>`",
          ephemeral: true,
        });
        break;
      }
    }
  }

  private async handleSelectMenuInteraction(interaction: any): Promise<void> {
    const customId = interaction.customId;
    const guildId = interaction.guildId!;
    const player = this.lavalink.getPlayer(guildId);

    if (!player) {
      await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
      return;
    }

    if (customId === "queue_select_jump") {
      const selectedValue = interaction.values[0];
      if (selectedValue?.startsWith("queue_jump_")) {
        const targetIndex = parseInt(selectedValue.replace("queue_jump_", ""), 10);
        if (targetIndex >= 0 && targetIndex < player.queue.tracks.length) {
          const targetTrack = player.queue.tracks[targetIndex];
          // Skip tracks before target
          if (targetIndex > 0) {
            player.queue.splice(0, targetIndex);
          }
          await player.skip();
          controllerUpdater.requestUpdate(this, player);
          await interaction.reply({
            content: `⏭️ Jumped directly to track: **${escapeMarkdown(targetTrack?.info?.title || "Selected track")}**!`,
            ephemeral: true,
          });
        }
      }
    } else if (customId === "filter_select") {
      const selectedFilter = interaction.values[0];
      await applyFilterPreset(player, selectedFilter);
      controllerUpdater.requestUpdate(this, player);
      await interaction.reply({
        content: `🎛️ Applied audio effect: \`${selectedFilter}\``,
        ephemeral: true,
      });
    }
  }

  private async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.customId === "modal_save_playlist") {
      const name = interaction.fields.getTextInputValue("playlist_name_input");
      const player = this.lavalink.getPlayer(interaction.guildId!);
      if (!player) {
        await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
        return;
      }

      const allTracks: any[] = [];
      if (player.queue.current) {
        allTracks.push({
          title: player.queue.current.info.title,
          author: player.queue.current.info.author,
          uri: player.queue.current.info.uri,
          duration: player.queue.current.info.duration,
          thumbnail: player.queue.current.info.artworkUrl,
        });
      }
      for (const t of player.queue.tracks) {
        allTracks.push({
          title: t.info.title,
          author: t.info.author,
          uri: t.info.uri,
          duration: t.info.duration,
          thumbnail: t.info.artworkUrl,
        });
      }

      const saved = playlistRepo.savePlaylist(interaction.user.id, interaction.guildId!, name, allTracks);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.bot.embedColor)
            .setTitle("💾 Playlist Saved to Server")
            .setDescription(`Saved **${saved.trackCount}** tracks to playlist **${escapeMarkdown(name)}**!`),
        ],
        ephemeral: true,
      });
    }
  }
}
