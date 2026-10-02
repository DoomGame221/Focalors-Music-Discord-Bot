import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { GuildPlayer } from "../player/GuildPlayer";
import { config } from "../config";
import { createProgressBar, escapeMarkdown, truncate } from "../utils/formatters";

export interface ControllerOptions {
  voiceChannelId?: string;
  requesterId?: string;
}

/**
 * Builds the modern, clean Focalors Music Controller Embed
 */
export function buildControllerEmbed(player: GuildPlayer, options?: ControllerOptions): EmbedBuilder {
  const current = player.queue.current;
  const nextTrack = player.queue.tracks[0];
  const position = player.position || 0;
  const duration = current?.info?.duration || 0;

  const title = current?.info?.title ? escapeMarkdown(current.info.title) : "Unknown Title";
  const author = current?.info?.author ? escapeMarkdown(current.info.author) : "Unknown Artist";
  const uri = current?.info?.uri || "https://discord.com";
  const artwork = current?.info?.artworkUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500";

  const nextTitle = nextTrack
    ? `**[${truncate(escapeMarkdown(nextTrack.info.title || "Unknown Title"), 40)}](${nextTrack.info.uri || "https://discord.com"})** - ${escapeMarkdown(nextTrack.info.author || "Unknown Artist")}`
    : "*None (End of queue)*";

  const loopMode = player.repeatMode === "track" ? "🔂 Track" : player.repeatMode === "queue" ? "🔁 Queue" : "❌ Off";
  const autoplayState = (player as any).get?.("autoplay") ? "✅ On" : "❌ Off";
  const filterState = player.activeFilter !== "reset" ? `🎛️ ${player.activeFilter}` : "Default";

  const embed = new EmbedBuilder()
    .setColor(config.bot.embedColor)
    .setAuthor({
      name: "Focalors Music — Now Playing",
      iconURL: "https://i.giphy.com/SS8zaNFIbwyjcPdh8U.gif",
    })
    .setTitle(`🎶 ${truncate(title, 60)}`)
    .setURL(uri)
    .setThumbnail(artwork)
    .setDescription(
      [
        createProgressBar(position, duration, 14),
        "",
        `**Next Song:**`,
        nextTitle,
      ].join("\n")
    )
    .addFields([
      { name: "👤 Artist", value: truncate(author, 25), inline: true },
      {
        name: "🔊 Voice Channel",
        value: options?.voiceChannelId ? `<#${options.voiceChannelId}>` : "Connected",
        inline: true,
      },
      {
        name: "🎧 Requested by",
        value: current?.requester ? `<@${(current.requester as any).id || current.requester}>` : (options?.requesterId ? `<@${options.requesterId}>` : "Unknown"),
        inline: true,
      },
      {
        name: "📖 คู่มือปุ่มควบคุม",
        value: "`⏮️ ย้อน` `⏪ -10s` `⏯️ เล่น/พัก` `⏩ +10s` `⏭️ ข้าม`\n`🔊 ปรับเสียง` `🔁 วนซ้ำ` `🔀 สลับ` `♾️ ออโต้เพลย์` `⏹️ หยุด`\n`📋 ดูคิว` `🎛️ ปรับ EQ` `💾 บันทึกเพลย์ลิสต์` `🚪 ออกจากห้อง`",
        inline: false,
      },
    ])
    .setFooter({
      text: `Queue: ${player.queue.tracks.length} | Vol: ${player.volume}% | Loop: ${loopMode} | AutoPlay: ${autoplayState} | Filter: ${filterState}`,
    });

  return embed;
}

/**
 * Builds the 3 rows of clean, intuitive ActionRow buttons
 */
export function buildControllerComponents(player: GuildPlayer): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const isPaused = player.paused;

  // Row 1: Playback Controls (5 buttons)
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ctrl_prev")
      .setEmoji("⏮️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_rewind")
      .setEmoji("⏪")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_playpause")
      .setEmoji(isPaused ? "▶️" : "⏸️")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ctrl_forward")
      .setEmoji("⏩")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_skip")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Primary)
  );

  // Row 2: Volume, Modes & Stop (5 buttons)
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ctrl_volume")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_loop")
      .setEmoji("🔁")
      .setStyle(player.repeatMode !== "off" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_shuffle")
      .setEmoji("🔀")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_autoplay")
      .setEmoji("♾️")
      .setStyle((player as any).get?.("autoplay") ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_stop")
      .setEmoji("⏹️")
      .setStyle(ButtonStyle.Danger)
  );

  // Row 3: Menus, Utilities & Leave (4 buttons)
  const row3 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ctrl_queuelist")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_filters")
      .setEmoji("🎛️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_saveplaylist")
      .setEmoji("💾")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ctrl_leave")
      .setEmoji("🚪")
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2, row3];
}
