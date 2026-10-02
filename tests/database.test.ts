import { describe, expect, it, beforeEach } from "bun:test";
import { playlistRepo } from "../src/database/playlistRepo";
import { getDatabase } from "../src/database/sqlite";

describe("SQLite Playlist Repository", () => {
  beforeEach(() => {
    const db = getDatabase();
    db.run("DELETE FROM playlist_tracks");
    db.run("DELETE FROM playlists");
  });

  it("saves a playlist and its tracks into SQLite", () => {
    const userId = "user_12345";
    const guildId = "guild_67890";
    const name = "Running In The 90s Favorites";

    const tracks = [
      {
        title: "Running In The 90's",
        author: "Max Coveri",
        uri: "https://www.youtube.com/watch?v=sample1",
        duration: 287000,
        thumbnail: "https://example.com/thumb1.jpg",
      },
      {
        title: "Forever (Extended Mix)",
        author: "Mordax Bastards",
        uri: "https://www.youtube.com/watch?v=sample2",
        duration: 312000,
        thumbnail: "https://example.com/thumb2.jpg",
      },
    ];

    const result = playlistRepo.savePlaylist(userId, guildId, name, tracks);
    expect(result.trackCount).toBe(2);

    const retrieved = playlistRepo.getPlaylist(userId, name);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.playlist.name).toBe(name);
    expect(retrieved!.tracks.length).toBe(2);
    expect(retrieved!.tracks[0]?.title).toBe("Running In The 90's");
    expect(retrieved!.tracks[1]?.title).toBe("Forever (Extended Mix)");
  });

  it("lists all playlists for a user with correct track count", () => {
    const userId = "user_abc";
    const guildId = "guild_xyz";

    playlistRepo.savePlaylist(userId, guildId, "Playlist A", [
      { title: "Song 1", author: "Artist 1", uri: "https://example.com/1", duration: 100000 },
    ]);
    playlistRepo.savePlaylist(userId, guildId, "Playlist B", [
      { title: "Song 2", author: "Artist 2", uri: "https://example.com/2", duration: 200000 },
      { title: "Song 3", author: "Artist 3", uri: "https://example.com/3", duration: 300000 },
    ]);

    const list = playlistRepo.getUserPlaylists(userId);
    expect(list.length).toBe(2);
    expect(list.find((p) => p.name === "Playlist A")?.track_count).toBe(1);
    expect(list.find((p) => p.name === "Playlist B")?.track_count).toBe(2);
  });

  it("deletes a playlist and cascades track deletion", () => {
    const userId = "user_del";
    const guildId = "guild_del";
    const name = "To Delete";

    playlistRepo.savePlaylist(userId, guildId, name, [
      { title: "Song Del", author: "Artist Del", uri: "https://example.com/del", duration: 120000 },
    ]);

    const deleted = playlistRepo.deletePlaylist(userId, name);
    expect(deleted).toBe(true);

    const retrieved = playlistRepo.getPlaylist(userId, name);
    expect(retrieved).toBeNull();
  });
});
