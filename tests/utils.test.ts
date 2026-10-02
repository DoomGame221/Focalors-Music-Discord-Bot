import { describe, expect, it } from "bun:test";
import { formatDuration, createProgressBar, truncate, escapeMarkdown } from "../src/utils/formatters";

describe("Formatters Utility", () => {
  it("formats duration under 1 hour correctly (MM:SS)", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65000)).toBe("01:05");
    expect(formatDuration(287000)).toBe("04:47"); // Matches reference image 04:47!
  });

  it("formats duration over 1 hour correctly (HH:MM:SS)", () => {
    expect(formatDuration(3665000)).toBe("01:01:05");
    expect(formatDuration(7200000)).toBe("02:00:00");
  });

  it("handles live stream duration", () => {
    expect(formatDuration(-1)).toBe("00:00");
    expect(createProgressBar(0, 0)).toBe("🔴 LIVE STREAM");
  });

  it("creates a properly styled progress bar", () => {
    const bar = createProgressBar(30000, 60000, 10);
    expect(bar).toContain("`00:30`");
    expect(bar).toContain("`01:00`");
    expect(bar).toContain("🔘");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("Short", 10)).toBe("Short");
    expect(truncate("A very long track title that exceeds max limit", 20)).toBe("A very long track...");
  });

  it("escapes markdown characters", () => {
    expect(escapeMarkdown("Track *Title* with _underscores_")).toBe("Track \\*Title\\* with \\_underscores\\_");
  });
});
