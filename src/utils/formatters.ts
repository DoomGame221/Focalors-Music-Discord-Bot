/**
 * Format milliseconds into human-readable duration (MM:SS or HH:MM:SS)
 */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0 || !isFinite(ms)) return "00:00";
  
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedSeconds = seconds.toString().padStart(2, "0");
  const paddedMinutes = minutes.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
}

/**
 * Generate an elegant progress bar for audio playback
 * e.g., 01:23 🔘────────────── 04:12
 */
export function createProgressBar(
  currentMs: number,
  totalMs: number,
  size: number = 14,
  lineChar: string = "─",
  sliderChar: string = "🔘"
): string {
  if (!totalMs || totalMs <= 0 || !isFinite(totalMs)) {
    return `🔴 LIVE STREAM`;
  }

  const progress = Math.min(Math.max(currentMs / totalMs, 0), 1);
  const progressIndex = Math.round(size * progress);

  const before = lineChar.repeat(Math.max(0, progressIndex));
  const after = lineChar.repeat(Math.max(0, size - progressIndex));

  const bar = `${before}${sliderChar}${after}`;
  return `\`${formatDuration(currentMs)}\` ${bar} \`${formatDuration(totalMs)}\``;
}

/**
 * Truncate long strings for clean Discord Embed display
 */
export function truncate(text: string, maxLen: number = 40): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

/**
 * Escape markdown characters to avoid broken formatting
 */
export function escapeMarkdown(text: string): string {
  if (!text) return "";
  return text.replace(/([*_`~|\\])/g, "\\$1");
}
