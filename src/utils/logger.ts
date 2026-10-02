import { cyan, green, yellow, red, gray, blue, magenta } from "colorette";

function getTimestamp(): string {
  const now = new Date();
  return now.toTimeString().split(" ")[0] || "";
}

export const logger = {
  info(message: string, context: string = "Bot"): void {
    console.log(`${gray(`[${getTimestamp()}]`)} ${blue(`[${context}]`)} ${message}`);
  },

  success(message: string, context: string = "Bot"): void {
    console.log(`${gray(`[${getTimestamp()}]`)} ${green(`[${context}]`)} ${message}`);
  },

  warn(message: string, context: string = "Bot"): void {
    console.warn(`${gray(`[${getTimestamp()}]`)} ${yellow(`[${context}]`)} ${message}`);
  },

  error(message: string, context: string = "Bot", error?: unknown): void {
    console.error(`${gray(`[${getTimestamp()}]`)} ${red(`[${context}]`)} ${message}`);
    if (error) {
      console.error(error);
    }
  },

  lavalink(message: string): void {
    console.log(`${gray(`[${getTimestamp()}]`)} ${cyan("[Lavalink]")} ${message}`);
  },

  focalors(message: string): void {
    console.log(`${gray(`[${getTimestamp()}]`)} ${magenta("[Focalors]")} ${message}`);
  },
};
