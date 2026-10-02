export interface TrackRequester {
  id: string;
  tag?: string;
}

export interface TrackInfo {
  identifier: string;
  title: string;
  author: string;
  uri: string;
  duration: number; // in milliseconds
  artworkUrl?: string;
  isStream?: boolean;
}

export interface Track {
  info: TrackInfo;
  requester?: TrackRequester;
}

export type RepeatMode = "off" | "track" | "queue";

export type FilterPreset =
  | "reset"
  | "filter_reset"
  | "bassboost_high"
  | "filter_bassboost_high"
  | "bassboost_med"
  | "filter_bassboost_med"
  | "nightcore"
  | "filter_nightcore"
  | "vaporwave"
  | "filter_vaporwave"
  | "8d"
  | "filter_8d"
  | "pop"
  | "filter_pop";
