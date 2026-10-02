import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InviteTargetType,
  PermissionFlagsBits,
  type VoiceBasedChannel,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { config } from "../config";
import { logger } from "../utils/logger";

// Official Discord Activity Application IDs
export const DISCORD_ACTIVITIES = {
  WATCH_TOGETHER: "880218394199220334", // Official YouTube Watch Together
  JAMSPACE: "1070089409705844786",
  POKER_NIGHT: "755827207812677713",
  CHESS_IN_THE_PARK: "832012774040141894",
};

export async function createActivityInvite(
  voiceChannel: VoiceBasedChannel,
  applicationId: string = DISCORD_ACTIVITIES.WATCH_TOGETHER
): Promise<{ url: string; code: string }> {
  const botMember = voiceChannel.guild?.members?.me;
  if (botMember) {
    const perms = voiceChannel.permissionsFor(botMember);
    if (!perms?.has(PermissionFlagsBits.CreateInstantInvite)) {
      throw new Error("บอทขาดสิทธิ์ 'Create Instant Invite' (สร้างคำเชิญ) ในห้องเสียงนี้");
    }
    if (!perms?.has(PermissionFlagsBits.UseEmbeddedActivities)) {
      throw new Error("บอทขาดสิทธิ์ 'Use Embedded Activities' (เริ่มกิจกรรม) ในห้องเสียงนี้");
    }
  }

  try {
    const invite = await voiceChannel.createInvite({
      maxAge: 86400, // 24 hours
      maxUses: 0,    // Unlimited uses
      targetType: InviteTargetType.EmbeddedApplication,
      targetApplication: applicationId,
    });

    return {
      url: `https://discord.gg/${invite.code}`,
      code: invite.code,
    };
  } catch (err: any) {
    logger.error("Failed to create Discord Activity invite", "Activity", err);
    throw new Error(err?.message || "Discord API ไม่ตอบสนองการสร้างกิจกรรม");
  }
}

export function buildActivityComponent(
  inviteUrl: string,
  activityName: string = "Watch Together (YouTube)"
): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setColor(config.bot.embedColor)
    .setTitle(`📺 Focalors Video Hub — ${activityName}`)
    .setDescription(
      [
        `คลิกปุ่ม **"🚀 เปิด ${activityName}"** ด้านล่างเพื่อเริ่มดูวิดีโอในห้องเสียงของคุณ!`,
        "",
        "✨ **ฟีเจอร์เด่น:**",
        "• ซิงค์ภาพและเสียง YouTube ให้ทุกคนในห้องดูพร้อมกัน",
        "• ไม่ต้องแชร์หน้าจอ ไม่กินสเปกเครื่อง",
        "• ใช้งานได้ทั้งบนคอมและมือถืออย่างเป็นทางการผ่าน Discord",
      ].join("\n")
    )
    .setFooter({
      text: "Powered by Discord Embedded App SDK",
    });

  const button = new ButtonBuilder()
    .setLabel(`เปิด ${activityName}`)
    .setEmoji("🚀")
    .setStyle(ButtonStyle.Link)
    .setURL(inviteUrl);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button);

  return { embed, components: [row] };
}
