import { getDatabase } from "./sqlite";

export interface PlaylistRecord {
  id: number;
  user_id: string;
  guild_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  track_count?: number;
}

export interface PlaylistTrackRecord {
  id: number;
  playlist_id: number;
  title: string;
  author: string;
  uri: string;
  duration: number;
  thumbnail: string | null;
  position: number;
}

export interface TrackInput {
  title: string;
  author: string;
  uri: string;
  duration: number;
  thumbnail?: string | null;
}

export const playlistRepo = {
  /**
   * Save a playlist with all its tracks (overwrites if already exists for this user)
   */
  savePlaylist(
    userId: string,
    guildId: string,
    name: string,
    tracks: TrackInput[]
  ): { id: number; trackCount: number } {
    const db = getDatabase();

    // Use transaction for high performance and atomicity
    const transaction = db.transaction(() => {
      // 1. Delete existing playlist with this name if exists
      const existing = db
        .query<{ id: number }, [string, string]>(
          "SELECT id FROM playlists WHERE user_id = ? AND name = ?"
        )
        .get(userId, name);

      if (existing) {
        db.run("DELETE FROM playlists WHERE id = ?", [existing.id]);
      }

      // 2. Insert new playlist
      const insertPlaylist = db.query<
        { id: number },
        [string, string, string]
      >(
        "INSERT INTO playlists (user_id, guild_id, name) VALUES (?, ?, ?) RETURNING id"
      );
      const playlist = insertPlaylist.get(userId, guildId, name);

      if (!playlist) {
        throw new Error("Failed to insert playlist");
      }

      // 3. Batch insert tracks
      const insertTrack = db.query(
        "INSERT INTO playlist_tracks (playlist_id, title, author, uri, duration, thumbnail, position) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );

      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (!t) continue;
        insertTrack.run(
          playlist.id,
          t.title,
          t.author,
          t.uri,
          t.duration,
          t.thumbnail || null,
          i
        );
      }

      return { id: playlist.id, trackCount: tracks.length };
    });

    return transaction();
  },

  /**
   * Get a playlist and its tracks by user and name
   */
  getPlaylist(
    userId: string,
    name: string
  ): { playlist: PlaylistRecord; tracks: PlaylistTrackRecord[] } | null {
    const db = getDatabase();
    const playlist = db
      .query<PlaylistRecord, [string, string]>(
        "SELECT * FROM playlists WHERE user_id = ? AND name = ?"
      )
      .get(userId, name);

    if (!playlist) return null;

    const tracks = db
      .query<PlaylistTrackRecord, [number]>(
        "SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC"
      )
      .all(playlist.id);

    return { playlist, tracks };
  },

  /**
   * List all playlists belonging to a user
   */
  getUserPlaylists(userId: string): (PlaylistRecord & { track_count: number })[] {
    const db = getDatabase();
    const playlists = db
      .query<(PlaylistRecord & { track_count: number }), [string]>(`
        SELECT p.*, COUNT(t.id) as track_count
        FROM playlists p
        LEFT JOIN playlist_tracks t ON p.id = t.playlist_id
        WHERE p.user_id = ?
        GROUP BY p.id
        ORDER BY p.updated_at DESC
      `)
      .all(userId);

    return playlists;
  },

  /**
   * Delete a playlist by user and name
   */
  deletePlaylist(userId: string, name: string): boolean {
    const db = getDatabase();
    const result = db.run(
      "DELETE FROM playlists WHERE user_id = ? AND name = ?",
      [userId, name]
    );
    return result.changes > 0;
  },
};
