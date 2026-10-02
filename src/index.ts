import { FocalorsClient } from "./client/FocalorsClient";
import { validateConfig } from "./config";
import { getDatabase } from "./database/sqlite";
import { logger } from "./utils/logger";

console.log(`
  💧 ================================================= 💧
      ███████╗ ██████╗  ██████╗ █████╗ ██╗      ██████╗ ██████╗ ███████╗
      ██╔════╝██╔═══██╗██╔════╝██╔══██╗██║     ██╔═══██╗██╔══██╗██╔════╝
      █████╗  ██║   ██║██║     ███████║██║     ██║   ██║██████╔╝███████╗
      ██╔══╝  ██║   ██║██║     ██╔══██║██║     ██║   ██║██╔══██╗╚════██║
      ██║     ╚██████╔╝╚██████╗██║  ██║███████╗╚██████╔╝██║  ██║███████║
      ╚═╝      ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
                               M U S I C   B O T
  💧 ================================================= 💧
`);

async function bootstrap(): Promise<void> {
  try {
    validateConfig();

    // Initialize Database
    getDatabase();

    // Initialize Bot Client
    const client = new FocalorsClient();
    await client.start();

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.warn(`Received ${signal}. Shutting down gracefully...`, "Lifecycle");
      try {
        // Destroy all players
        for (const [_, player] of client.lavalink.players) {
          await player.destroy(`Bot shutdown (${signal})`);
        }
        client.destroy();
      } catch (err) {
        logger.error("Error during shutdown cleanup", "Lifecycle", err);
      }
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    logger.error("Fatal error during bot initialization", "Bootstrap", err);
    process.exit(1);
  }
}

bootstrap();
