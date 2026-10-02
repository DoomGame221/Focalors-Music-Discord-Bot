import { REST, Routes } from "discord.js";
import { config, validateConfig } from "./config";
import { fmCommand } from "./commands/fm";
import { logger } from "./utils/logger";

validateConfig();

const rest = new REST({ version: "10" }).setToken(config.discord.token);

async function deploy(): Promise<void> {
  const commands = [fmCommand.data.toJSON()];

  logger.info(`Started deploying ${commands.length} application (/) commands...`, "Deploy");

  try {
    const guildId = process.env.DEV_GUILD_ID;

    if (guildId) {
      logger.info(`Deploying commands to Development Guild [${guildId}] (Instant)...`, "Deploy");
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, guildId),
        { body: commands }
      );
      logger.success("Successfully registered guild slash commands!", "Deploy");
    } else {
      logger.info("Deploying commands Globally (May take a few minutes for Discord caching)...", "Deploy");
      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      logger.success("Successfully registered global slash commands!", "Deploy");
    }
  } catch (error) {
    logger.error("Failed to deploy slash commands", "Deploy", error);
    process.exit(1);
  }
}

deploy();
