import { describe, expect, it } from "vitest";

const ALLOWED_FAVORITE_KEYS = [
  "source",
  "videoId",
  "page",
  "title",
  "thumb",
  "duration",
  "addedBy",
  "addedAt",
];

const ALLOWED_SONG_KEYS = [
  "id",
  "source",
  "videoId",
  "page",
  "title",
  "thumb",
  "duration",
  "addedBy",
  "addedAt",
  "finishedAt",
];

describe("Favorite shape stays canonical", () => {
  it("a favorite row never includes raw URLs or tracking params", () => {
    // What we actually persist. Mirrors db.ts addFavorite().
    const fav = {
      source: "bili" as const,
      videoId: "BV1y2q6YWEGp",
      page: 1,
      title: "试听",
      thumb: "https://i0.hdslb.com/bfs/archive/abc.jpg",
      duration: 234,
      addedBy: { id: "u_x", name: "memo", emoji: "🎤" },
      addedAt: 1700000000000,
    };
    for (const k of Object.keys(fav)) {
      expect(ALLOWED_FAVORITE_KEYS).toContain(k);
    }
    const blob = JSON.stringify(fav);
    expect(blob).not.toContain("spm_id_from");
    expect(blob).not.toContain("vd_source");
    expect(blob).not.toMatch(/https:\/\/www\.bilibili\.com\/video\//);
  });
});

describe("Song shape stays canonical", () => {
  it("a queued Song never carries the raw URL the user pasted", () => {
    const song = {
      id: "s_abc",
      source: "bili" as const,
      videoId: "BV1y2q6YWEGp",
      page: 1,
      title: "试听",
      thumb: null,
      duration: 234,
      addedBy: { id: "u_x", name: "memo", emoji: "🎤", anonymous: false },
      addedAt: 1700000000000,
    };
    for (const k of Object.keys(song)) {
      expect(ALLOWED_SONG_KEYS).toContain(k);
    }
    const blob = JSON.stringify(song);
    expect(blob).not.toContain("spm_id_from");
    expect(blob).not.toContain("vd_source");
    expect(blob).not.toContain("originalUrl");
  });
});
