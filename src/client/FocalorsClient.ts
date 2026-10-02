import {
  Client,
  GatewayIntentBits,
  Events,
  type Interaction,
  type VoiceState,
  type AutocompleteInteraction,
  type VoiceBasedChannel,
  TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
} from "discord.js";
import { PlayerManager } from "../player/PlayerManager";
import { YtDlpService } from "../player/YtDlpService";
import { fmCommand, applyFilterPreset } from "../commands/fm";
import { buildQueueMenu } from "../components/queueMenu";
import { buildFilterMenu } from "../components/filterMenu";
import { buildVolumeMenu } from "../components/volumeMenu";
import { controllerUpdater } from "../services/updater";
import { playlistRepo } from "../database/playlistRepo";
import { logger } from "../utils/logger";
import { config } from "../config";
import { escapeMarkdown } from "../utils/formatters";
import { getVoiceChannel } from "../utils/voice";

export class FocalorsClient extends Client {
  public playerManager: PlayerManager;
  private userVolumePanels = new Map<string, { messageId: string }>();

  // Compatibility getter so existing code calling client.lavalink continues to work
  public get lavalink(): PlayerManager {
    return this.playerManager;
  }

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.playerManager = new PlayerManager(this);
    YtDlpService.init(process.cwd());

    // Handle interactions (Slash commands, buttons, dropdowns, modals, autocomplete)
    this.on("interactionCreate", this.handleInteraction.bind(this));

    // Handle voice channel empty detection
    this.on(Events.VoiceStateUpdate, this.handleVoiceStateUpdate.bind(this));
  }

  public async start(): Promise<void> {
    this.once("ready", async () => {
      logger.focalors(`Focalors Music Bot is online as [${this.user?.tag}]! (Native Audio Engine)`);
    });

    await this.login(config.discord.token);
  }

  private async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const guildId = oldState.guild.id || newState.guild.id;
    const player = this.playerManager.getPlayer(guildId);
    if (!player || !player.voiceChannelId) return;

    const channel = oldState.guild.channels.cache.get(player.voiceChannelId) as VoiceBasedChannel | null;
    if (!channel || !channel.isVoiceBased()) return;

    // Filter out bots to check if any human member is left
    const humanMembers = channel.members.filter((m) => !m.user.bot);
    if (humanMembers.size === 0) {
      logger.info(`All human members left voice channel [${channel.name}] in guild [${guildId}]. Auto-leaving...`, "Voice");
      const textId = player.textChannelId;
      await controllerUpdater.deleteOldController(this, guildId);
      controllerUpdater.clear(guildId);
      player.destroy("Empty voice channel");

      if (textId) {
        try {
          const textChannel = (await this.channels.fetch(textId).catch(() => null)) as TextChannel | null;
          if (textChannel && textChannel.isTextBased()) {
            await textChannel.send("🚪 *บอทออกจากห้องเสียงแล้ว เนื่องจากไม่มีสมาชิกอยู่ในห้อง*");
          }
        } catch {}
      }
    }
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
      } else if (interaction.isAutocomplete()) {
        await this.handleAutocomplete(interaction);
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

  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === "name") {
      const userPlaylists = playlistRepo.getUserPlaylists(interaction.user.id);
      const filtered = userPlaylists.filter((p) =>
        p.name.toLowerCase().includes(focusedOption.value.toLowerCase())
      );
      await interaction.respond(
        filtered.slice(0, 25).map((p) => ({
          name: `${p.name} (${p.track_count} tracks)`,
          value: p.name,
        }))
      );
    }
  }

  private async handleButtonInteraction(interaction: any): Promise<void> {
    const customId: string = interaction.customId;
    const guildId = interaction.guildId!;

    const player = this.playerManager.getPlayer(guildId);

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

    // Leave button after queueEnd notice (can be clicked without being in voice)
    if (customId === "idle_leave_voice") {
      if (player) {
        await player.destroy("User clicked leave after queue end");
        await controllerUpdater.deleteOldController(this, guildId);
        controllerUpdater.clear(guildId);
      }
      await interaction.update({
        content: "🚪 *บอทออกจากห้องเสียงเรียบร้อยแล้ว*",
        embeds: [],
        components: [],
      });
      return;
    }

    // Quick volume adjustment buttons (from volume slider menu)
    if (customId === "vol_btn_down10") {
      if (player) {
        const newVol = Math.max(0, player.volume - 10);
        player.setVolume(newVol);
        controllerUpdater.requestUpdate(this, player);
        const menu = buildVolumeMenu(player);
        await interaction.update({ embeds: [menu.embed], components: menu.components });
      }
      return;
    }
    if (customId === "vol_btn_up10") {
      if (player) {
        const newVol = Math.min(150, player.volume + 10);
        player.setVolume(newVol);
        controllerUpdater.requestUpdate(this, player);
        const menu = buildVolumeMenu(player);
        await interaction.update({ embeds: [menu.embed], components: menu.components });
      }
      return;
    }
    if (customId === "vol_btn_custom") {
      const modal = new ModalBuilder()
        .setCustomId("modal_custom_volume")
        .setTitle("🔊 กำหนดระดับเสียง (0 - 150%)");

      const volInput = new TextInputBuilder()
        .setCustomId("volume_number_input")
        .setLabel("ระดับเสียงที่ต้องการ (0 - 150)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`เช่น 65 หรือ 80 (ปัจจุบัน: ${player ? player.volume : 100}%)`)
        .setMinLength(1)
        .setMaxLength(3)
        .setRequired(true);

      const row = new ActionRowBuilder<TextInputBuilder>().addComponents(volInput);
      modal.addComponents(row);
      await interaction.showModal(modal);
      return;
    }
    if (customId === "vol_btn_close") {
      const userKey = `${guildId}_${interaction.user.id}`;
      this.userVolumePanels.delete(userKey);
      await interaction.deleteReply().catch(async () => {
        await interaction.update({ content: "❌ *ปิดหน้าต่างปรับระดับเสียงแล้ว*", embeds: [], components: [] });
      });
      return;
    }
    if (customId === "vol_btn_100") {
      if (player) {
        player.setVolume(100);
        controllerUpdater.requestUpdate(this, player);
        const menu = buildVolumeMenu(player);
        await interaction.update({ embeds: [menu.embed], components: menu.components });
      }
      return;
    }
    if (customId === "vol_btn_mute") {
      if (player) {
        player.setVolume(0);
        controllerUpdater.requestUpdate(this, player);
        const menu = buildVolumeMenu(player);
        await interaction.update({ embeds: [menu.embed], components: menu.components });
      }
      return;
    }

    // Controls require user to be in voice channel
    const voiceChannel = await getVoiceChannel(interaction, this);
    if (!voiceChannel) {
      await interaction.reply({
        content: "❌ You must be in a Voice Channel to use playback controls!",
        ephemeral: true,
      });
      return;
    }

    if (!player) {
      await interaction.reply({
        content: "❌ No active music player in this server. Use `/fm play` to start!",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    switch (customId) {
      case "ctrl_prev": {
        if (player.queue.previous.length > 0) {
          const prevTrack = player.queue.previous.shift();
          if (prevTrack) {
            if (player.queue.current) {
              player.queue.tracks.unshift(player.queue.current);
            }
            await player.play({ track: prevTrack });
            controllerUpdater.requestUpdate(this, player);
          }
        }
        break;
      }
      case "ctrl_playpause": {
        if (player.paused) {
          player.resume();
        } else {
          player.pause();
        }
        controllerUpdater.requestUpdate(this, player);
        break;
      }
      case "ctrl_rewind": {
        const currentPos = player.position || 0;
        await player.seek(Math.max(0, currentPos - 10000));
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
      case "ctrl_volume": {
        const userKey = `${guildId}_${interaction.user.id}`;
        const existing = this.userVolumePanels.get(userKey);

        if (existing) {
          try {
            await interaction.webhook.deleteMessage(existing.messageId);
          } catch {}
          this.userVolumePanels.delete(userKey);
        } else {
          const menu = buildVolumeMenu(player);
          const msg = await interaction.followUp({
            embeds: [menu.embed],
            components: menu.components,
            ephemeral: true,
          });
          if (msg?.id) {
            this.userVolumePanels.set(userKey, { messageId: msg.id });
          }
        }
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
        player.queue.tracks.splice(0, player.queue.tracks.length);
        (player as any).set?.("autoplay", false);
        await player.stopPlaying(true);
        await controllerUpdater.deleteOldController(this, guildId);
        controllerUpdater.clear(guildId);
        break;
      }
      case "ctrl_leave": {
        await controllerUpdater.deleteOldController(this, guildId);
        try {
          if (interaction.message?.deletable) {
            await interaction.message.delete();
          }
        } catch {}
        await player.destroy("Controller leave button");
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
        const modal = new ModalBuilder()
          .setCustomId("modal_save_playlist")
          .setTitle("💾 Save Current Queue to Playlist");

        const nameInput = new TextInputBuilder()
          .setCustomId("playlist_name_input")
          .setLabel("Playlist Name")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. My Chill Hits")
          .setMinLength(1)
          .setMaxLength(50)
          .setRequired(true);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        break;
      }
    }
  }

  private async handleSelectMenuInteraction(interaction: any): Promise<void> {
    const customId: string = interaction.customId;
    const guildId = interaction.guildId!;
    const player = this.playerManager.getPlayer(guildId);

    if (!player) {
      await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
      return;
    }

    if (customId === "queue_select_jump") {
      const selectedValue = interaction.values[0];
      if (selectedValue?.startsWith("queue_jump_")) {
        const targetIndex = parseInt(selectedValue.replace("queue_jump_", ""), 10);
        if (targetIndex >= 0 && targetIndex < player.queue.tracks.length) {
          const jumpedTrack = await player.skipTo(targetIndex);
          if (jumpedTrack) {
            controllerUpdater.requestUpdate(this, player);
            await interaction.reply({
              content: `⏭️ ข้ามไปยังเพลง: **${escapeMarkdown(jumpedTrack.info.title || "Selected track")}** เรียบร้อยแล้ว!`,
              ephemeral: true,
            });
            return;
          }
        }
        await interaction.reply({
          content: "❌ ไม่สามารถข้ามไปยังเพลงที่เลือกได้ (เพลงอาจถูกลบไปแล้ว)",
          ephemeral: true,
        });
      }
    } else if (customId === "ctrl_volume_select") {
      const selectedVol = interaction.values[0];
      const volNum = parseInt(selectedVol.replace("vol_", ""), 10);
      if (!isNaN(volNum)) {
        player.setVolume(volNum);
        controllerUpdater.requestUpdate(this, player);
        const menu = buildVolumeMenu(player);
        await interaction.update({
          embeds: [menu.embed],
          components: menu.components,
        });
      }
    } else if (customId === "filter_select") {
      const selectedFilter = interaction.values[0];
      await applyFilterPreset(player, selectedFilter);
      controllerUpdater.requestUpdate(this, player);
      const friendlyName = selectedFilter.replace("filter_", "").replace(/_/g, " ").toUpperCase();
      await interaction.reply({
        content: `🎛️ Applied audio effect: **${friendlyName}**`,
        ephemeral: true,
      });
    }
  }

  private async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.customId === "modal_save_playlist") {
      const name = interaction.fields.getTextInputValue("playlist_name_input");
      const player = this.playerManager.getPlayer(interaction.guildId!);
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
      const userPlaylists = playlistRepo.getUserPlaylists(interaction.user.id);
      const plList = userPlaylists
        .map((p, i) => `\`${(i + 1).toString().padStart(2, "0")}.\` **${escapeMarkdown(p.name)}** (${p.track_count} เพลง)`)
        .join("\n");

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.bot.embedColor)
            .setTitle("💾 บันทึกเพลย์ลิสต์เรียบร้อยแล้ว")
            .setDescription(
              `บันทึกคิวเพลงปัจจุบัน (**${saved.trackCount}** เพลง) ในชื่อเพลย์ลิสต์ **"${escapeMarkdown(name)}"** สำเร็จ!\n\n` +
              `📂 **รายชื่อเพลย์ลิสต์ทั้งหมดของคุณ:**\n${plList}\n\n` +
              `💡 *วิธีเปิดฟัง: ใช้คำสั่ง \`/fm playlist load ${name}\`*`
            ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId === "modal_custom_volume") {
      const input = interaction.fields.getTextInputValue("volume_number_input");
      const num = parseInt(input.trim(), 10);
      const player = this.playerManager.getPlayer(interaction.guildId!);
      if (!player) {
        await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
        return;
      }
      if (isNaN(num) || num < 0 || num > 150) {
        await interaction.reply({
          content: "❌ กรุณากรอกตัวเลขระดับเสียงระหว่าง 0 ถึง 150 เท่านั้น!",
          ephemeral: true,
        });
        return;
      }
      player.setVolume(num);
      controllerUpdater.requestUpdate(this, player);
      const menu = buildVolumeMenu(player);
      await interaction.reply({
        content: `🔊 ปรับระดับเสียงเป็น **${num}%** เรียบร้อยแล้ว!`,
        embeds: [menu.embed],
        components: menu.components,
        ephemeral: true,
      });
      return;
    }
  }
}
