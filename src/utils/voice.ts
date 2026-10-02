import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  GuildMember,
  VoiceBasedChannel,
  Client,
} from "discord.js";

/**
 * Robustly retrieves the user's current Voice Channel from an interaction
 * Handles APIInteractionGuildMember, un-cached members, and guild voiceStates cache
 */
export async function getVoiceChannel(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  client: Client
): Promise<VoiceBasedChannel | null> {
  const guildId = interaction.guildId;
  if (!guildId) return null;

  const guild = interaction.guild || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return null;

  const userId = interaction.user.id;

  // 1. Try from interaction.member if already a GuildMember instance
  if (interaction.member && "voice" in interaction.member) {
    const member = interaction.member as GuildMember;
    if (member.voice?.channel) return member.voice.channel;
    if (member.voice?.channelId) {
      const ch = await guild.channels.fetch(member.voice.channelId).catch(() => null);
      if (ch?.isVoiceBased()) return ch;
    }
  }

  // 2. Try from guild.voiceStates cache (tracked by GuildVoiceStates intent)
  const voiceState = guild.voiceStates.cache.get(userId);
  if (voiceState?.channel) return voiceState.channel;
  if (voiceState?.channelId) {
    const ch = await guild.channels.fetch(voiceState.channelId).catch(() => null);
    if (ch?.isVoiceBased()) return ch;
  }

  // 3. Try fetching the member directly from the guild
  try {
    const member = await guild.members.fetch(userId);
    if (member?.voice?.channel) return member.voice.channel;
    if (member?.voice?.channelId) {
      const ch = await guild.channels.fetch(member.voice.channelId).catch(() => null);
      if (ch?.isVoiceBased()) return ch;
    }
  } catch {}

  return null;
}
