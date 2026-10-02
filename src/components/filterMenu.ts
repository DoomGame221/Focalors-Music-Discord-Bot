import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { Player } from "lavalink-client";
import { config } from "../config";

export function buildFilterMenu(player: Player): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
} {
  const isCustomActive = player.filterManager?.isCustomFilterActive();

  const embed = new EmbedBuilder()
    .setColor(config.bot.embedColor)
    .setTitle("🎛️ Focalors Music — Audio Equalizer & Filters")
    .setDescription(
      [
        "Select an audio effect from the menu below to apply real-time DSP filters.",
        "",
        `**Current Filter Status:** \`${isCustomActive ? "Active" : "Normal / Flat"}\``,
      ].join("\n")
    )
    .setFooter({
      text: "Filters take effect within 1-2 seconds after selection.",
    });

  const select = new StringSelectMenuBuilder()
    .setCustomId("filter_select")
    .setPlaceholder("👇 Choose an audio filter...")
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel("Normal / Reset Filters")
        .setDescription("Reset all audio filters and equalizer to default")
        .setValue("filter_reset")
        .setEmoji("🔄"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Bassboost High")
        .setDescription("Powerful bass enhancement")
        .setValue("filter_bassboost_high")
        .setEmoji("🔊"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Bassboost Medium")
        .setDescription("Balanced bass enhancement")
        .setValue("filter_bassboost_med")
        .setEmoji("🔉"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Nightcore")
        .setDescription("Higher pitch and faster tempo (1.25x)")
        .setValue("filter_nightcore")
        .setEmoji("🌙"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Vaporwave")
        .setDescription("Slowed down with deeper pitch (0.8x)")
        .setValue("filter_vaporwave")
        .setEmoji("🌊"),
      new StringSelectMenuOptionBuilder()
        .setLabel("8D Audio")
        .setDescription("Surround 360 rotating audio effect")
        .setValue("filter_8d")
        .setEmoji("🎧"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Pop EQ")
        .setDescription("Vocal-centric clarity equalizer")
        .setValue("filter_pop")
        .setEmoji("🍿"),
    ]);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);

  return { embed, components: [row] };
}
