import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type VoiceBasedChannel,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { config } from "../config";
import { logger } from "../utils/logger";

// Popular official Discord Activity Application IDs
export const DISCORD_ACTIVITIES = {
  YOUTUBE_TOGETHER: "880218394199220274",
  WATCH_TOGETHER: "755600276941176913",
  JAMSPACE: "1070089409705844786",
};

export async function createActivityInvite(
  voiceChannel: VoiceBasedChannel,
  applicationId: string = DISCORD_ACTIVITIES.YOUTUBE_TOGETHER
): Promise<{ url: string; code: string }> {
  try {
    const invite = await (voiceChannel as any).createInvite({
      maxAge: 86400, // 24 hours
      maxUses: 0,    // Unlimited uses
      targetType: 2, // TARGET_TYPE_EMBEDDED_APPLICATION
      targetApplication: applicationId,
    });

    return {
      url: `https://discord.gg/${invite.code}`,
      code: invite.code,
    };
  } catch (err) {
    logger.error("Failed to create Discord Activity invite", "Activity", err);
    throw err;
  }
}

export function buildActivityComponent(inviteUrl: string, activityName: string = "YouTube Watch Together"): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setColor(config.bot.embedColor)
    .setTitle(`📺 Focalors Video Hub — ${activityName}`)
    .setDescription(
      [
        `Click the button below to launch **${activityName}** in your current voice channel!`,
        "",
        "✨ **Features:**",
        "• Synchronized video playback with everyone in the room",
        "• Safe & Official: 100% compliant with Discord Terms of Service",
        "• Works seamlessly on both Discord Desktop & Mobile apps",
      ].join("\n")
    )
    .setFooter({
      text: "Powered by Discord Embedded App SDK",
    });

  const button = new ButtonBuilder()
    .setLabel(`Launch ${activityName}`)
    .setEmoji("🚀")
    .setStyle(ButtonStyle.Link)
    .setURL(inviteUrl);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button);

  return { embed, components: [row] };
}
