import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
} from "discord.js";
import type { FocalorsClient } from "../client/FocalorsClient";
import { config } from "../config";
import { formatDuration, escapeMarkdown, truncate } from "../utils/formatters";
import { buildControllerComponents, buildControllerEmbed } from "../components/controller";
import { buildQueueMenu } from "../components/queueMenu";
import { buildFilterMenu } from "../components/filterMenu";
import { playlistRepo } from "../database/playlistRepo";
import { createActivityInvite, buildActivityComponent } from "../services/activityService";
import { controllerUpdater } from "../services/updater";
import { YtDlpService } from "../player/YtDlpService";
import { getVoiceChannel } from "../utils/voice";

export const fmCommand = {
  data: new SlashCommandBuilder()
    .setName("fm")
    .setDescription("Focalors Music — High-performance Discord music system")
    // /fm play <query>
    .addSubcommand((sub) =>
      sub
        .setName("play")
        .setDescription("Play a song or playlist from YouTube, Spotify, SoundCloud, or URL")
        .addStringOption((opt) =>
          opt
            .setName("query")
            .setDescription("Song title, artist, YouTube/Spotify link")
            .setRequired(true)
        )
    )
    // /fm list [page]
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("View the current queue with an interactive song selection dropdown")
        .addIntegerOption((opt) =>
          opt
            .setName("page")
            .setDescription("Page number to view")
            .setMinValue(1)
        )
    )
    // /fm pause
    .addSubcommand((sub) =>
      sub.setName("pause").setDescription("Pause current playback")
    )
    // /fm resume
    .addSubcommand((sub) =>
      sub.setName("resume").setDescription("Resume current playback")
    )
    // /fm skip [to]
    .addSubcommand((sub) =>
      sub
        .setName("skip")
        .setDescription("Skip the current song (or jump to a specific track index)")
        .addIntegerOption((opt) =>
          opt
            .setName("to")
            .setDescription("Track index number in queue to skip to")
            .setMinValue(1)
        )
    )
    // /fm previous
    .addSubcommand((sub) =>
      sub.setName("previous").setDescription("Play the previously played song")
    )
    // /fm stop
    .addSubcommand((sub) =>
      sub.setName("stop").setDescription("Stop playback and clear all queue/playlist (Stay in voice channel)")
    )
    // /fm leave
    .addSubcommand((sub) =>
      sub.setName("leave").setDescription("Disconnect the bot from the voice channel")
    )
    // /fm volume <level>
    .addSubcommand((sub) =>
      sub
        .setName("volume")
        .setDescription("Set playback volume (1-150%)")
        .addIntegerOption((opt) =>
          opt
            .setName("level")
            .setDescription("Volume level percentage")
            .setMinValue(1)
            .setMaxValue(150)
            .setRequired(true)
        )
    )
    // /fm nowplaying
    .addSubcommand((sub) =>
      sub.setName("nowplaying").setDescription("Display the interactive music controller")
    )
    // /fm loop <mode>
    .addSubcommand((sub) =>
      sub
        .setName("loop")
        .setDescription("Set loop/repeat mode")
        .addStringOption((opt) =>
          opt
            .setName("mode")
            .setDescription("Loop mode")
            .setRequired(true)
            .addChoices(
              { name: "Off", value: "off" },
              { name: "Track (Loop Current Song)", value: "track" },
              { name: "Queue (Loop Entire Queue)", value: "queue" }
            )
        )
    )
    // /fm shuffle
    .addSubcommand((sub) =>
      sub.setName("shuffle").setDescription("Shuffle the songs in the queue")
    )
    // /fm seek <seconds>
    .addSubcommand((sub) =>
      sub
        .setName("seek")
        .setDescription("Seek to a specific time in seconds")
        .addIntegerOption((opt) =>
          opt
            .setName("seconds")
            .setDescription("Time position in seconds")
            .setMinValue(0)
            .setRequired(true)
        )
    )
    // /fm filter [type]
    .addSubcommand((sub) =>
      sub
        .setName("filter")
        .setDescription("Apply real-time audio filters or open the filter selector")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Audio filter preset")
            .addChoices(
              { name: "Reset / Flat", value: "reset" },
              { name: "Bassboost (High)", value: "bassboost_high" },
              { name: "Bassboost (Medium)", value: "bassboost_med" },
              { name: "Nightcore", value: "nightcore" },
              { name: "Vaporwave", value: "vaporwave" },
              { name: "8D Audio", value: "8d" },
              { name: "Pop EQ", value: "pop" }
            )
        )
    )
    // /fm playlist <action>
    .addSubcommand((sub) =>
      sub
        .setName("playlist")
        .setDescription("Manage server-side playlists saved in SQLite")
        .addStringOption((opt) =>
          opt
            .setName("action")
            .setDescription("Playlist operation")
            .setRequired(true)
            .addChoices(
              { name: "Save current queue", value: "save" },
              { name: "Load playlist to queue", value: "load" },
              { name: "List your saved playlists", value: "list" },
              { name: "Delete playlist", value: "delete" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Playlist name (required for save/load/delete)")
        )
    )
    // /fm video [url]
    .addSubcommand((sub) =>
      sub
        .setName("video")
        .setDescription("Launch synchronized video player (Watch Together) in your voice channel")
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription("Video URL to watch together")
        )
    )
    // /fm status
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("View bot latency, Lavalink node performance, and memory stats")
    ),

  async execute(interaction: ChatInputCommandInteraction, client: FocalorsClient): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "❌ You can only use Focalors Music inside a server!",
        ephemeral: true,
      });
      return;
    }

    // Commands that don't strictly require voice channel: status, playlist list
    if (subcommand === "status") {
      await handleStatus(interaction, client);
      return;
    }

    if (subcommand === "playlist" && interaction.options.getString("action") === "list") {
      await handlePlaylistList(interaction);
      return;
    }

    const voiceChannel = await getVoiceChannel(interaction, client);

    if (subcommand === "video") {
      if (!voiceChannel) {
        await interaction.reply({
          content: "❌ You must be in a Voice Channel to launch video mode!",
          ephemeral: true,
        });
        return;
      }
      await handleVideo(interaction, voiceChannel);
      return;
    }

    // Music commands require voice channel
    if (!voiceChannel) {
      await interaction.reply({
        content:
          "❌ ไม่พบห้องเสียงที่คุณอยู่! โปรดตรวจสอบว่า:\n" +
          "1. คุณได้เชื่อมต่อเข้าห้องเสียง (Voice Channel) แล้วหรือไม่\n" +
          "2. บอทมีสิทธิ์ **\"ดูแชนแนล (View Channel)\"** และ **\"เชื่อมต่อ (Connect)\"** ในห้องเสียงนั้นหรือไม่ (แนะนำให้ตั้งยศบอทเป็น 'ผู้ดูแล / Administrator')",
        ephemeral: true,
      });
      return;
    }

    const player = client.lavalink.getPlayer(guildId);

    switch (subcommand) {
      case "play":
        await handlePlay(interaction, client, voiceChannel);
        break;
      case "list":
        await handleList(interaction, player);
        break;
      case "pause":
        await handlePause(interaction, client, player);
        break;
      case "resume":
        await handleResume(interaction, client, player);
        break;
      case "skip":
        await handleSkip(interaction, client, player);
        break;
      case "previous":
        await handlePrevious(interaction, client, player);
        break;
      case "stop":
        await handleStop(interaction, client, player);
        break;
      case "leave":
        await handleLeave(interaction, client, player);
        break;
      case "volume":
        await handleVolume(interaction, client, player);
        break;
      case "nowplaying":
        await handleNowPlaying(interaction, player);
        break;
      case "loop":
        await handleLoop(interaction, client, player);
        break;
      case "shuffle":
        await handleShuffle(interaction, client, player);
        break;
      case "seek":
        await handleSeek(interaction, client, player);
        break;
      case "filter":
        await handleFilter(interaction, client, player);
        break;
      case "playlist":
        await handlePlaylist(interaction, client, player, voiceChannel);
        break;
      default:
        await interaction.reply({ content: "Unknown subcommand", ephemeral: true });
    }
  },
};

// Handlers for each subcommand
async function handlePlay(
  interaction: ChatInputCommandInteraction,
  client: FocalorsClient,
  voiceChannel: any
): Promise<void> {
  const rawQuery = interaction.options.getString("query", true);
  await interaction.deferReply();

  let cleanQuery = rawQuery.trim();
  // Clean youtu.be tracking parameters (e.g. ?si=...) and convert to standard watch URL
  const youtuMatch = cleanQuery.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (youtuMatch && youtuMatch[1]) {
    cleanQuery = `https://www.youtube.com/watch?v=${youtuMatch[1]}`;
  } else if (!cleanQuery.includes("list=")) {
    const ytWatchMatch = cleanQuery.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/);
    if (ytWatchMatch && ytWatchMatch[1]) {
      cleanQuery = `https://www.youtube.com/watch?v=${ytWatchMatch[1]}`;
    }
  }

  let player = client.playerManager.getPlayer(interaction.guildId!);
  if (!player) {
    player = client.playerManager.createPlayer(interaction.guildId!, interaction.channelId);
  } else {
    player.textChannelId = interaction.channelId;
  }

  if (!player.connected) {
    await player.connect(voiceChannel, interaction.channelId);
  }

  const res = await YtDlpService.resolve(cleanQuery, {
    id: interaction.user.id,
    tag: interaction.user.tag,
  });

  if (!res || !res.tracks.length) {
    await interaction.editReply({
      content: `❌ No results found for: \`${escapeMarkdown(cleanQuery)}\`\n*(Please ensure query or link is valid)*`,
    });
    return;
  }

  if (res.loadType === "playlist") {
    player.queue.add(res.tracks);
    const totalDuration = res.tracks.reduce((acc, t) => acc + (t.info.duration || 0), 0);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.bot.embedColor)
          .setTitle("📑 Added Playlist to Queue")
          .setDescription(
            `Added **${res.tracks.length}** tracks from **${escapeMarkdown(res.playlistName || cleanQuery)}**\nTotal Duration: \`${formatDuration(totalDuration)}\``
          ),
      ],
    });
  } else {
    const track = res.tracks[0];
    if (!track) return;
    player.queue.add(track);

    if (player.playing) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.bot.embedColor)
            .setTitle("🎵 Added to Queue")
            .setDescription(
              `**[${escapeMarkdown(track.info.title || "Unknown Title")}](${track.info.uri || "https://discord.com"})**\nArtist: \`${escapeMarkdown(track.info.author || "Unknown Artist")}\` | Duration: \`${formatDuration(track.info.duration || 0)}\``
            )
            .setThumbnail(track.info.artworkUrl || null),
        ],
      });
    } else {
      await interaction.editReply({
        content: `🎶 Starting playback for: **${escapeMarkdown(track.info.title)}**`,
      });
    }
  }

  if (!player.playing) {
    await player.play();
  } else {
    controllerUpdater.requestUpdate(client, player);
  }
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  player: any
): Promise<void> {
  if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
    await interaction.reply({ content: "❌ The queue is currently empty!", ephemeral: true });
    return;
  }
  const page = interaction.options.getInteger("page") || 1;
  const menu = buildQueueMenu(player, page);
  await interaction.reply({
    embeds: [menu.embed],
    components: menu.components,
    ephemeral: true,
  });
}

async function handlePause(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player || !player.playing) {
    await interaction.reply({ content: "❌ Nothing is currently playing!", ephemeral: true });
    return;
  }
  if (player.paused) {
    await interaction.reply({ content: "⚠️ The player is already paused!", ephemeral: true });
    return;
  }
  await player.pause();
  controllerUpdater.requestUpdate(client, player);
  await interaction.reply({ content: "⏸️ Playback paused.", ephemeral: true });
}

async function handleResume(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player) {
    await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
    return;
  }
  if (!player.paused) {
    await interaction.reply({ content: "⚠️ Playback is already playing!", ephemeral: true });
    return;
  }
  await player.resume();
  controllerUpdater.requestUpdate(client, player);
  await interaction.reply({ content: "▶️ Playback resumed.", ephemeral: true });
}

async function handleSkip(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player || !player.queue.current) {
    await interaction.reply({ content: "❌ Nothing to skip!", ephemeral: true });
    return;
  }
  const to = interaction.options.getInteger("to");
  if (to && to > 1 && to <= player.queue.tracks.length) {
    await player.skip(to - 1);
    await interaction.reply({ content: `⏭️ Skipped directly to track #${to}.` });
  } else {
    const skippedTitle = player.queue.current.info.title;
    await player.skip();
    await interaction.reply({ content: `⏭️ Skipped: **${escapeMarkdown(skippedTitle)}**` });
  }
  controllerUpdater.requestUpdate(client, player);
}

async function handlePrevious(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player || !player.queue.previous.length) {
    await interaction.reply({ content: "❌ There are no previous songs in history!", ephemeral: true });
    return;
  }
  const prevTrack = player.queue.previous.shift();
  if (prevTrack) {
    if (player.queue.current) {
      player.queue.tracks.unshift(player.queue.current);
    }
    await player.play({ track: prevTrack });
    controllerUpdater.requestUpdate(client, player);
    await interaction.reply({ content: `⏮️ Replaying: **${escapeMarkdown(prevTrack.info.title)}**` });
  }
}

async function handleStop(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player) {
    await interaction.reply({ content: "❌ ไม่มีเพลงที่กำลังเล่นอยู่!", ephemeral: true });
    return;
  }
  // Clear upcoming tracks in queue
  player.queue.tracks.splice(0, player.queue.tracks.length);
  // Turn off autoplay so it doesn't automatically queue more songs
  (player as any).set?.("autoplay", false);
  // Stop current track but stay in voice channel
  await player.stopPlaying(true);
  await controllerUpdater.deleteOldController(client, interaction.guildId!);
  controllerUpdater.clear(interaction.guildId!);
  await interaction.reply({ content: "⏹️ หยุดเล่นเพลง ล้างคิว และปิดหน้าควบคุมเรียบร้อยแล้ว (บอทยังคงอยู่ในห้องเสียง)" });
}

async function handleLeave(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player) {
    await interaction.reply({ content: "❌ บอทไม่ได้อยู่ในห้องเสียง!", ephemeral: true });
    return;
  }
  await controllerUpdater.deleteOldController(client, interaction.guildId!);
  controllerUpdater.clear(interaction.guildId!);
  await player.destroy("Command leave");
  await interaction.reply({ content: "🚪 ออกจากห้องเสียงและปิดหน้าต่างควบคุมเรียบร้อยแล้ว" });
}

async function handleVolume(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player) {
    await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
    return;
  }
  const level = interaction.options.getInteger("level", true);
  await player.setVolume(level);
  controllerUpdater.requestUpdate(client, player);
  await interaction.reply({ content: `🔊 Volume set to **${level}%**`, ephemeral: true });
}

async function handleNowPlaying(interaction: ChatInputCommandInteraction, player: any): Promise<void> {
  if (!player || !player.queue.current) {
    await interaction.reply({ content: "❌ Nothing is currently playing!", ephemeral: true });
    return;
  }
  const embed = buildControllerEmbed(player, { voiceChannelId: player.voiceChannelId });
  const components = buildControllerComponents(player);
  await interaction.reply({ embeds: [embed], components, ephemeral: false });
}

async function handleLoop(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player) {
    await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
    return;
  }
  const mode = interaction.options.getString("mode", true) as "off" | "track" | "queue";
  await player.setRepeatMode(mode);
  controllerUpdater.requestUpdate(client, player);
  await interaction.reply({ content: `🔁 Loop mode set to: **${mode.toUpperCase()}**`, ephemeral: true });
}

async function handleShuffle(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player || player.queue.tracks.length === 0) {
    await interaction.reply({ content: "❌ Not enough songs in queue to shuffle!", ephemeral: true });
    return;
  }
  await player.queue.shuffle();
  controllerUpdater.requestUpdate(client, player);
  await interaction.reply({ content: `🔀 Shuffled **${player.queue.tracks.length}** songs in the queue!` });
}

async function handleSeek(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player || !player.queue.current) {
    await interaction.reply({ content: "❌ Nothing is currently playing!", ephemeral: true });
    return;
  }
  const seconds = interaction.options.getInteger("seconds", true);
  const ms = seconds * 1000;
  await player.seek(ms);
  controllerUpdater.requestUpdate(client, player);
  await interaction.reply({ content: `⏩ Seeked to \`${formatDuration(ms)}\``, ephemeral: true });
}

async function handleFilter(interaction: ChatInputCommandInteraction, client: FocalorsClient, player: any): Promise<void> {
  if (!player) {
    await interaction.reply({ content: "❌ No active player found!", ephemeral: true });
    return;
  }
  const type = interaction.options.getString("type");
  if (!type) {
    // Show filter menu
    const menu = buildFilterMenu(player);
    await interaction.reply({ embeds: [menu.embed], components: menu.components, ephemeral: true });
    return;
  }

  await applyFilterPreset(player, type);
  controllerUpdater.requestUpdate(client, player);
  await interaction.reply({ content: `🎛️ Applied filter preset: **${type}**`, ephemeral: true });
}

export async function applyFilterPreset(player: any, preset: string): Promise<void> {
  if (player?.setFilter) {
    await player.setFilter(preset);
  }
}

async function handlePlaylist(
  interaction: ChatInputCommandInteraction,
  client: FocalorsClient,
  player: any,
  voiceChannel: any
): Promise<void> {
  const action = interaction.options.getString("action", true);
  const name = interaction.options.getString("name");
  const userId = interaction.user.id;
  const guildId = interaction.guildId!;

  if (action === "save") {
    if (!name) {
      await interaction.reply({ content: "❌ Please provide a name for the playlist! e.g. `/fm playlist save myfav`", ephemeral: true });
      return;
    }
    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      await interaction.reply({ content: "❌ There are no tracks in the queue to save!", ephemeral: true });
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

    const saved = playlistRepo.savePlaylist(userId, guildId, name, allTracks);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.bot.embedColor)
          .setTitle("💾 Playlist Saved to Ubuntu Server")
          .setDescription(`Successfully saved playlist **${escapeMarkdown(name)}** with **${saved.trackCount}** tracks!`)
          .setFooter({ text: `Stored in ${config.bot.databasePath} (Bun Native SQLite)` }),
      ],
    });
  } else if (action === "load") {
    if (!name) {
      await interaction.reply({ content: "❌ Please provide the name of the playlist to load! e.g. `/fm playlist load myfav`", ephemeral: true });
      return;
    }

    const pl = playlistRepo.getPlaylist(userId, name);
    if (!pl || pl.tracks.length === 0) {
      await interaction.reply({ content: `❌ Playlist **${escapeMarkdown(name)}** not found!`, ephemeral: true });
      return;
    }

    await interaction.deferReply();

    let targetPlayer = client.playerManager.getPlayer(guildId);
    if (!targetPlayer) {
      targetPlayer = client.playerManager.createPlayer(guildId, interaction.channelId);
    } else {
      targetPlayer.textChannelId = interaction.channelId;
    }

    if (!targetPlayer.connected) {
      await targetPlayer.connect(voiceChannel, interaction.channelId);
    }

    let loadedCount = 0;
    for (const t of pl.tracks) {
      targetPlayer.queue.add({
        info: {
          identifier: t.uri,
          title: t.title,
          author: t.author || "Unknown Artist",
          uri: t.uri,
          duration: t.duration || 0,
          artworkUrl: t.thumbnail || undefined,
        },
        requester: { id: interaction.user.id, tag: interaction.user.tag },
      });
      loadedCount++;
    }

    if (!targetPlayer.playing) {
      await targetPlayer.play();
    } else {
      controllerUpdater.requestUpdate(client, targetPlayer);
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.bot.embedColor)
          .setTitle("📂 Playlist Loaded")
          .setDescription(`Loaded **${loadedCount}** tracks from **${escapeMarkdown(name)}** into the queue!`),
      ],
    });
  } else if (action === "delete") {
    if (!name) {
      await interaction.reply({ content: "❌ Please provide the playlist name to delete!", ephemeral: true });
      return;
    }
    const deleted = playlistRepo.deletePlaylist(userId, name);
    if (deleted) {
      await interaction.reply({ content: `🗑️ Deleted playlist **${escapeMarkdown(name)}**.` });
    } else {
      await interaction.reply({ content: `❌ Playlist **${escapeMarkdown(name)}** not found.`, ephemeral: true });
    }
  }
}

async function handlePlaylistList(interaction: ChatInputCommandInteraction): Promise<void> {
  const playlists = playlistRepo.getUserPlaylists(interaction.user.id);
  if (playlists.length === 0) {
    await interaction.reply({
      content: "📂 You don't have any saved playlists yet! Save one with `/fm playlist save <name>`.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(config.bot.embedColor)
    .setTitle(`📂 Your Saved Playlists (${playlists.length})`)
    .setDescription(
      playlists
        .map(
          (p, i) =>
            `\`${(i + 1).toString().padStart(2, "0")}.\` **${escapeMarkdown(p.name)}** — \`${p.track_count} tracks\` *(Updated: ${p.updated_at.split(" ")[0]})*`
        )
        .join("\n")
    )
    .setFooter({ text: "Use /fm playlist load <name> to play any playlist" });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleVideo(
  interaction: ChatInputCommandInteraction,
  voiceChannel: any
): Promise<void> {
  await interaction.deferReply();
  const videoUrl = interaction.options.getString("url");
  try {
    const invite = await createActivityInvite(voiceChannel);
    const component = buildActivityComponent(invite.url, "Watch Together (YouTube)");

    if (videoUrl) {
      component.embed.addFields({
        name: "💡 วิดีโอที่คุณระบุ",
        value: `[กดดูหรือ Copy ลิงก์ไปเปิดใน Watch Together](${videoUrl})`,
      });
    }

    await interaction.editReply({
      embeds: [component.embed],
      components: component.components,
    });
  } catch (err: any) {
    await interaction.editReply({
      content: `❌ **ไม่สามารถเริ่มระบบ Watch Together ได้:** ${err?.message || err}`,
    });
  }
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  client: FocalorsClient
): Promise<void> {
  const ping = client.ws.ping;
  const memory = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());

  const embed = new EmbedBuilder()
    .setColor(config.bot.embedColor)
    .setTitle("⚡ Focalors Music — System & Performance Status")
    .addFields([
      { name: "🏓 Gateway Latency", value: `\`${ping} ms\``, inline: true },
      { name: "⏱️ Bot Uptime", value: `\`${formatDuration(uptimeSeconds * 1000)}\``, inline: true },
      { name: "⚡ Bun Memory (RSS)", value: `\`${(memory.rss / 1024 / 1024).toFixed(2)} MB\``, inline: true },
      {
        name: "🔊 Audio Engine",
        value: "🟢 Native (@discordjs/voice + yt-dlp)",
        inline: true,
      },
      {
        name: "🎶 Active Players",
        value: `\`${client.playerManager.players.size} players\``,
        inline: true,
      },
    ])
    .setFooter({ text: "Running on Bun Runtime + @discordjs/voice + yt-dlp (Native High Performance)" });

  await interaction.reply({ embeds: [embed] });
}
