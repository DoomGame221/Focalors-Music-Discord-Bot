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

export function createVolumeBar(volume: number, maxVolume: number = 150, length: number = 14): string {
  const percent = Math.min(Math.max(volume / maxVolume, 0), 1);
  const filled = Math.round(percent * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export function buildVolumeMenu(player: GuildPlayer): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
} {
  const currentVol = player.volume;
  const bar = createVolumeBar(currentVol);

  const embed = new EmbedBuilder()
    .setColor(config.bot.embedColor)
    .setTitle("🔊 ปรับระดับเสียง (Volume Slider)")
    .setDescription(
      [
        `**ระดับเสียงปัจจุบัน:** \`${currentVol}%\` / \`150%\``,
        `\`[${bar}]\``,
        "",
        "👇 **เลือกความดังจากแถบเลื่อนด้านล่าง หรือกดปุ่มลัดเพื่อปรับทันที:**",
      ].join("\n")
    )
    .setFooter({ text: "เลือกจากเมนูด้านล่างเพื่อปรับระดับเสียงทันที" });

  const selectOptions = [
    { label: "10% [█░░░░░░░░░░░░░] — เบามาก (Whisper)", value: "vol_10" },
    { label: "25% [███░░░░░░░░░░░] — เบา (Low)", value: "vol_25" },
    { label: "50% [███████░░░░░░░] — ปานกลาง (Medium)", value: "vol_50" },
    { label: "75% [██████████░░░░] — ค่อนข้างดัง (High)", value: "vol_75" },
    { label: "100% [██████████████] — ค่าเริ่มต้น (Default)", value: "vol_100" },
    { label: "125% [███████████████] — บูสต์เสียง (Boost)", value: "vol_125" },
    { label: "150% [████████████████] — ดังสุดขีด (Max)", value: "vol_150" },
  ].map((opt) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(opt.label)
      .setValue(opt.value)
      .setDefault(currentVol === parseInt(opt.value.replace("vol_", ""), 10))
  );

  const selectRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ctrl_volume_select")
      .setPlaceholder(`🎚️ เลื่อนปรับระดับเสียง (ตอนนี้: ${currentVol}%)`)
      .addOptions(selectOptions)
  );

  const quickRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("vol_btn_down10")
      .setLabel("-10%")
      .setEmoji("🔉")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("vol_btn_up10")
      .setLabel("+10%")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("vol_btn_100")
      .setLabel("รีเซ็ต (100%)")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("vol_btn_mute")
      .setLabel("ปิดเสียง (0%)")
      .setEmoji("🔇")
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, components: [selectRow, quickRow] };
}
