import dotenv from "dotenv";

dotenv.config();

export interface BotConfig {
  discord: {
    token: string;
    clientId: string;
  };
  lavalink: {
    host: string;
    port: number;
    password: string;
    secure: boolean;
  };
  bot: {
    defaultVolume: number;
    defaultSearchPlatform: string;
    databasePath: string;
    embedColor: number; // Hex color for embeds
  };
}

export const config: BotConfig = {
  discord: {
    token: process.env.DISCORD_TOKEN || "",
    clientId: process.env.DISCORD_CLIENT_ID || "",
  },
  lavalink: {
    host: process.env.LAVALINK_HOST || "localhost",
    port: parseInt(process.env.LAVALINK_PORT || "2333", 10),
    password: process.env.LAVALINK_PASSWORD || "youshallnotpass",
    secure: process.env.LAVALINK_SECURE === "true",
  },
  bot: {
    defaultVolume: parseInt(process.env.DEFAULT_VOLUME || "100", 10),
    defaultSearchPlatform: process.env.DEFAULT_SEARCH_PLATFORM || "ytsearch",
    databasePath: process.env.DATABASE_PATH || "./focalors.db",
    embedColor: 0x00a8e8, // Focalors Fontaine Hydro Blue
  },
};

export function validateConfig(): void {
  if (!config.discord.token) {
    console.warn("⚠️ [Config] DISCORD_TOKEN is missing! Please configure it in .env file.");
  }
  if (!config.discord.clientId) {
    console.warn("⚠️ [Config] DISCORD_CLIENT_ID is missing! Please configure it in .env file.");
  }
}
