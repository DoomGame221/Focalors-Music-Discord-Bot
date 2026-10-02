import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  GuildMember,
  VoiceBasedChannel,
  Client,
} from "discord.js";
import { logger } from "./logger";

/**
 * Robustly retrieves the user's current Voice Channel from an interaction
 * Checks interaction.member, guild.voiceStates, member fetch, and channel scans
 */
export async function getVoiceChannel(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  client: Client
): Promise<VoiceBasedChannel | null> {
  const guildId = interaction.guildId;
  if (!guildId) return null;

  const guild = interaction.guild || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    logger.warn(`Could not resolve guild with ID: ${guildId}`, "Voice");
    return null;
  }

  const userId = interaction.user.id;
  const botMember = guild.members.me || (await guild.members.fetch(client.user!.id).catch(() => null));

  logger.info(
    `Checking voice state for [${interaction.user.tag}] in guild [${guild.name}]. (Bot Admin: ${botMember?.permissions.has("Administrator") ?? false})`,
    "Voice"
  );

  // 1. Try from interaction.member if already a GuildMember instance
  if (interaction.member && "voice" in interaction.member) {
    const member = interaction.member as GuildMember;
    if (member.voice?.channel) {
      logger.info(`Found voice channel via interaction.member: "${member.voice.channel.name}"`, "Voice");
      return member.voice.channel;
    }
    if (member.voice?.channelId) {
      const ch = await guild.channels.fetch(member.voice.channelId).catch(() => null);
      if (ch?.isVoiceBased()) return ch;
    }
  }

  // 2. Try from guild.voiceStates cache (tracked by GuildVoiceStates intent)
  const voiceState = guild.voiceStates.cache.get(userId);
  if (voiceState?.channel) {
    logger.info(`Found voice channel via guild.voiceStates cache: "${voiceState.channel.name}"`, "Voice");
    return voiceState.channel;
  }
  if (voiceState?.channelId) {
    const ch = await guild.channels.fetch(voiceState.channelId).catch(() => null);
    if (ch?.isVoiceBased()) return ch;
  }

  // 3. Try fetching the member directly from the guild
  try {
    const member = await guild.members.fetch(userId);
    if (member?.voice?.channel) {
      logger.info(`Found voice channel via fetched member: "${member.voice.channel.name}"`, "Voice");
      return member.voice.channel;
    }
    if (member?.voice?.channelId) {
      const ch = await guild.channels.fetch(member.voice.channelId).catch(() => null);
      if (ch?.isVoiceBased()) return ch;
    }
  } catch (err: any) {
    logger.warn(`Failed to fetch member ${userId}: ${err?.message || err}`, "Voice");
  }

  // 4. Fallback: Fetch all channels and find which channel has the user in channel.members
  try {
    const channels = await guild.channels.fetch().catch(() => null);
    if (channels) {
      for (const [_, ch] of channels) {
        if (ch && ch.isVoiceBased() && ch.members?.has(userId)) {
          logger.info(`Found voice channel via channel scan: "${ch.name}"`, "Voice");
          return ch;
        }
      }
    }
  } catch (err: any) {
    logger.warn(`Failed during channel scan: ${err?.message || err}`, "Voice");
  }

  logger.warn(
    `User [${interaction.user.tag}] was not found in any voice channel in guild [${guild.name}]. ` +
      `Check if the bot has "View Channel" and "Connect" permissions for the voice channel!`,
    "Voice"
  );
  return null;
}
