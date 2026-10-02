import { EventEmitter } from "node:events";
import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import type { Track, RepeatMode, FilterPreset } from "./types";
import { YtDlpService } from "./YtDlpService";
import { logger } from "../utils/logger";

export class GuildPlayer extends EventEmitter {
  public guildId: string;
  public voiceChannelId: string | null = null;
  public textChannelId: string | null = null;

  public voiceConnection: VoiceConnection | null = null;
  public audioPlayer: AudioPlayer;
  public audioResource: AudioResource | null = null;

  public volume: number = 100;
  public repeatMode: RepeatMode = "off";
  public activeFilter: FilterPreset = "reset";

  private positionMs: number = 0;
  private positionTimer: ReturnType<typeof setInterval> | null = null;
  private customData: Map<string, any> = new Map();

  public queue: {
    current: Track | null;
    tracks: Track[];
    previous: Track[];
    add: (track: Track | Track[]) => void;
    clear: () => void;
    shuffle: () => void;
    splice: (start: number, deleteCount?: number) => Track[];
  };

  // Node information stub for controller embed compatibility
  public node = {
    id: "Native-Bun-Node",
  };

  constructor(guildId: string, textChannelId?: string) {
    super();
    this.guildId = guildId;
    this.textChannelId = textChannelId || null;

    const tracksList: Track[] = [];
    const previousList: Track[] = [];

    this.queue = {
      current: null,
      tracks: tracksList,
      previous: previousList,
      add: (item: Track | Track[]) => {
        if (Array.isArray(item)) {
          tracksList.push(...item);
        } else {
          tracksList.push(item);
        }
      },
      clear: () => {
        tracksList.length = 0;
      },
      shuffle: () => {
        for (let i = tracksList.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = tracksList[i]!;
          tracksList[i] = tracksList[j]!;
          tracksList[j] = temp;
        }
      },
      splice: (start: number, deleteCount: number = 1) => {
        return tracksList.splice(start, deleteCount);
      },
    };

    this.audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });

    this.setupAudioPlayerEvents();
  }

  public get playing(): boolean {
    return this.audioPlayer.state.status === AudioPlayerStatus.Playing;
  }

  public get paused(): boolean {
    return this.audioPlayer.state.status === AudioPlayerStatus.Paused;
  }

  public get position(): number {
    return this.positionMs;
  }

  public get connected(): boolean {
    return (
      this.voiceConnection !== null &&
      this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed &&
      this.voiceConnection.state.status !== VoiceConnectionStatus.Disconnected
    );
  }

  public get filterManager() {
    return {
      isCustomFilterActive: () => this.activeFilter !== "reset" && this.activeFilter !== "filter_reset",
    };
  }

  public set(key: string, value: any): void {
    this.customData.set(key, value);
  }

  public get(key: string): any {
    return this.customData.get(key);
  }

  /**
   * Connect to Discord Voice Channel
   */
  public async connect(voiceChannel: VoiceBasedChannel, textChannelId?: string): Promise<void> {
    this.voiceChannelId = voiceChannel.id;
    if (textChannelId) {
      this.textChannelId = textChannelId;
    }

    if (
      this.voiceConnection &&
      this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      if (this.voiceConnection.joinConfig.channelId !== voiceChannel.id) {
        this.voiceConnection.rejoin({
          channelId: voiceChannel.id,
          selfDeaf: true,
          selfMute: false,
        });
      }
      return;
    }

    this.voiceConnection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator as any,
      selfDeaf: true,
      selfMute: false,
    });

    this.voiceConnection.subscribe(this.audioPlayer);

    try {
      await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 15_000);
      logger.success(`Joined voice channel: "${voiceChannel.name}" in guild [${this.guildId}]`, "Voice");
    } catch (err) {
      logger.error(`Failed to connect to voice channel within 15s in guild [${this.guildId}]`, "Voice", err);
      this.destroy("Voice connection timeout");
      throw err;
    }

    this.voiceConnection.on("stateChange", (_, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        this.destroy("Disconnected from voice channel");
      }
    });
  }

  /**
   * Starts playback of a track or the next track in the queue
   */
  public async play(options?: { track?: Track }): Promise<void> {
    let nextTrack = options?.track;
    if (!nextTrack) {
      if (this.queue.tracks.length === 0) {
        this.emit("queueEnd", this);
        return;
      }
      nextTrack = this.queue.tracks.shift()!;
    }

    this.queue.current = nextTrack;
    this.positionMs = 0;
    this.startPositionTimer();

    try {
      const stream = YtDlpService.createAudioStream(nextTrack.info.uri, 0, this.activeFilter);
      this.audioResource = createAudioResource(stream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });

      this.audioResource.volume?.setVolume(this.volume / 100);
      this.audioPlayer.play(this.audioResource);

      this.emit("trackStart", this, nextTrack);
    } catch (err: any) {
      logger.error(`Error initiating playback for "${nextTrack.info.title}": ${err.message}`, "Player");
      this.emit("trackError", this, nextTrack, err);
      // Attempt next track
      await this.play();
    }
  }

  public pause(): void {
    this.audioPlayer.pause();
    this.stopPositionTimer();
  }

  public resume(): void {
    this.audioPlayer.unpause();
    this.startPositionTimer();
  }

  public async skip(): Promise<boolean> {
    if (!this.queue.current) return false;

    if (this.repeatMode === "track") {
      // Re-queue track
      this.queue.tracks.unshift(this.queue.current);
    }

    this.stopPositionTimer();
    this.audioPlayer.stop();
    return true;
  }

  public async seek(positionMs: number): Promise<void> {
    if (!this.queue.current) return;

    this.positionMs = positionMs;
    const stream = YtDlpService.createAudioStream(
      this.queue.current.info.uri,
      this.positionMs,
      this.activeFilter
    );

    this.audioResource = createAudioResource(stream, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });

    this.audioResource.volume?.setVolume(this.volume / 100);
    this.audioPlayer.play(this.audioResource);
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(150, volume));
    this.audioResource?.volume?.setVolume(this.volume / 100);
  }

  public setRepeatMode(mode: RepeatMode): void {
    this.repeatMode = mode;
  }

  public async setFilter(filter: FilterPreset): Promise<void> {
    this.activeFilter = filter;
    if (this.queue.current && this.playing) {
      await this.seek(this.positionMs);
    }
  }

  public stopPlaying(clearQueue: boolean = true): void {
    if (clearQueue) {
      this.queue.tracks.length = 0;
    }
    this.queue.current = null;
    this.stopPositionTimer();
    this.audioPlayer.stop();
  }

  public destroy(reason?: string): void {
    logger.info(`Destroying player for guild [${this.guildId}]: ${reason || "manual"}`, "Player");
    this.stopPlaying(true);
    if (this.voiceConnection) {
      try {
        this.voiceConnection.destroy();
      } catch {}
      this.voiceConnection = null;
    }
    this.emit("playerDestroy", this);
  }

  private setupAudioPlayerEvents(): void {
    this.audioPlayer.on(AudioPlayerStatus.Idle, async () => {
      this.stopPositionTimer();

      if (this.queue.current) {
        this.queue.previous.unshift(this.queue.current);
        if (this.queue.previous.length > 25) {
          this.queue.previous.pop();
        }

        this.emit("trackEnd", this, this.queue.current);

        if (this.repeatMode === "track") {
          await this.play({ track: this.queue.current });
          return;
        }

        if (this.repeatMode === "queue") {
          this.queue.tracks.push(this.queue.current);
        }
      }

      if (this.queue.tracks.length > 0) {
        await this.play();
      } else {
        this.queue.current = null;
        this.emit("queueEnd", this);
      }
    });

    this.audioPlayer.on("error", (error) => {
      logger.error(`Audio player error in guild [${this.guildId}]: ${error.message}`, "AudioPlayer");
      this.emit("trackError", this, this.queue.current, error);
    });
  }

  private startPositionTimer(): void {
    this.stopPositionTimer();
    this.positionTimer = setInterval(() => {
      if (this.playing) {
        this.positionMs += 1000;
      }
    }, 1000);
  }

  private stopPositionTimer(): void {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
  }
}
