import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tmp = mkdtempSync(join(tmpdir(), "litektv-db-test-"));
const dbPath = join(tmp, "test.db");

// Configure DB_PATH BEFORE importing the modules under test, since `config`
// is captured at module load.
process.env.DB_PATH = dbPath;

const dbModule = await import("./db.js");
const { initDb, addFavorite, listFavorites, removeFavorite, findFavorite } =
  dbModule;

beforeAll(() => {
  initDb();
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const ALICE = { id: "u_alice", name: "Alice", emoji: "🎤" };
const BOB = { id: "u_bob", name: "Bob", emoji: "👻" };

describe("favorites are global (site-wide)", () => {
  it("adding the same song twice keeps one row and preserves the first starrer", () => {
    const fav = {
      source: "bili" as const,
      videoId: "BV_dedupe_1",
      page: 0,
      title: "Original",
      thumb: null,
      duration: 100,
      addedBy: ALICE,
      addedAt: 1_700_000_000_000,
    };
    const r1 = addFavorite(fav);
    const r2 = addFavorite({
      ...fav,
      title: "Other",
      addedBy: BOB,
      addedAt: 1_999_999_999_999,
    });
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    const list = listFavorites();
    const row = list.find((f) => f.videoId === "BV_dedupe_1")!;
    expect(row).toBeTruthy();
    expect(row.addedAt).toBe(1_700_000_000_000);
    expect(row.title).toBe("Original");
    expect(row.addedBy?.name).toBe("Alice");
  });

  it("Bilibili p=2 and p=3 are separate favorites", () => {
    addFavorite({ source: "bili", videoId: "BV_p", page: 2, title: "P2", thumb: null, addedBy: ALICE, addedAt: 1, duration: undefined });
    addFavorite({ source: "bili", videoId: "BV_p", page: 3, title: "P3", thumb: null, addedBy: BOB, addedAt: 2, duration: undefined });
    const all = listFavorites();
    const matching = all.filter((f) => f.videoId === "BV_p");
    expect(matching).toHaveLength(2);
    expect(new Set(matching.map((f) => f.page))).toEqual(new Set([2, 3]));
  });

  it("favorites list is shared across users; both starrers see all entries", () => {
    addFavorite({ source: "yt", videoId: "shared_1", page: 0, title: "shared by alice", thumb: null, addedBy: ALICE, addedAt: 10 });
    addFavorite({ source: "yt", videoId: "shared_2", page: 0, title: "shared by bob", thumb: null, addedBy: BOB, addedAt: 20 });
    // listFavorites() takes no owner key — there's only one global list.
    const list = listFavorites();
    expect(list.some((f) => f.videoId === "shared_1")).toBe(true);
    expect(list.some((f) => f.videoId === "shared_2")).toBe(true);
  });

  it("any user's remove takes effect for everyone (favorites are public)", () => {
    addFavorite({ source: "yt", videoId: "to_remove", page: 0, title: "x", thumb: null, addedBy: ALICE, addedAt: 1 });
    expect(findFavorite("yt", "to_remove", 0)).not.toBeNull();
    const r = removeFavorite("yt", "to_remove", 0);
    expect(r.removed).toBe(true);
    expect(findFavorite("yt", "to_remove", 0)).toBeNull();
  });
});
