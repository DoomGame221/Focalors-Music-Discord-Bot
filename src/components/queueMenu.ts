import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { GuildPlayer } from "../player/GuildPlayer";
import { config } from "../config";
import { formatDuration, escapeMarkdown, truncate } from "../utils/formatters";

export const TRACKS_PER_PAGE = 10;

export interface QueueDisplay {
  embed: EmbedBuilder;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

/**
 * Builds the interactive paginated Queue list with a Select Menu to jump directly to any track
 */
export function buildQueueMenu(player: GuildPlayer, page: number = 1): QueueDisplay {
  const current = player.queue.current;
  const tracks = player.queue.tracks;
  const totalTracks = tracks.length;
  const totalPages = Math.max(1, Math.ceil(totalTracks / TRACKS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startIndex = (currentPage - 1) * TRACKS_PER_PAGE;
  const endIndex = Math.min(startIndex + TRACKS_PER_PAGE, totalTracks);
  const currentTracks = tracks.slice(startIndex, endIndex);

  // Calculate total remaining duration
  const totalDurationMs = tracks.reduce((acc, t) => acc + (t.info.duration || 0), 0) +
    ((current?.info?.duration || 0) - (player.position || 0));

  const embed = new EmbedBuilder()
    .setColor(config.bot.embedColor)
    .setTitle(`📜 Focalors Music — Queue List`)
    .setFooter({
      text: `Page ${currentPage} of ${totalPages} | Total: ${totalTracks} tracks (${formatDuration(totalDurationMs)})`,
    });

  let description = "";

  if (current) {
    description += `**🎶 Now Playing:**\n[${escapeMarkdown(current.info.title)}](${current.info.uri}) — \`${formatDuration(player.position || 0)} / ${formatDuration(current.info.duration)}\`\n\n`;
  }

  if (currentTracks.length === 0) {
    description += "*The queue is empty. Use `/fm play` to add songs!*";
  } else {
    description += `**📑 Up Next (Page ${currentPage}/${totalPages}):**\n`;
    for (let i = 0; i < currentTracks.length; i++) {
      const track = currentTracks[i];
      if (!track) continue;
      const index = startIndex + i + 1;
      const title = truncate(escapeMarkdown(track.info.title || "Unknown Title"), 40);
      const uri = track.info.uri || "https://discord.com";
      const duration = formatDuration(track.info.duration || 0);
      description += `\`${index.toString().padStart(2, "0")}.\` [${title}](${uri}) — \`${duration}\`\n`;
    }
  }

  embed.setDescription(description);

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  // Dropdown Select Menu to jump directly to a song on this page
  if (currentTracks.length > 0) {
    const selectOptions: StringSelectMenuOptionBuilder[] = [];

    for (let i = 0; i < currentTracks.length; i++) {
      const track = currentTracks[i];
      if (!track) continue;
      const queueIndex = startIndex + i;
      selectOptions.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(`${queueIndex + 1}. ${track.info.title || "Unknown"}`, 90))
          .setDescription(truncate(`${track.info.author || "Unknown"} • ${formatDuration(track.info.duration || 0)}`, 90))
          .setValue(`queue_jump_${queueIndex}`)
          .setEmoji("🎵")
      );
    }

    const selectRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("queue_select_jump")
        .setPlaceholder("👇 Select a song to jump to it immediately...")
        .addOptions(selectOptions)
    );
    components.push(selectRow);
  }

  // Navigation buttons for pagination
  if (totalPages > 1) {
    const navRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue_page_${currentPage - 1}`)
        .setLabel("Previous Page")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1),
      new ButtonBuilder()
        .setCustomId(`queue_page_${currentPage + 1}`)
        .setLabel("Next Page")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages),
      new ButtonBuilder()
        .setCustomId("queue_refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    );
    components.push(navRow);
  }

  return { embed, components };
}
