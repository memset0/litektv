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
const {
  initDb,
  insertAccount,
  addFavorite,
  listFavorites,
  removeFavorite,
  mergeAnonFavoritesIntoAccount,
} = dbModule;

beforeAll(() => {
  initDb();
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("favorites dedupe", () => {
  const owner = "anon:u_dedupe" as const;

  it("adding the same song twice keeps one row and preserves added_at", () => {
    const fav = {
      source: "bili" as const,
      videoId: "BV_dedupe_1",
      page: 0,
      title: "T",
      thumb: null,
      duration: 100,
      addedAt: 1_700_000_000_000,
    };
    const r1 = addFavorite(owner, fav);
    const r2 = addFavorite(owner, { ...fav, addedAt: 1_999_999_999_999, title: "different" });
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    const list = listFavorites(owner);
    expect(list).toHaveLength(1);
    expect(list[0]!.addedAt).toBe(1_700_000_000_000);
    expect(list[0]!.title).toBe("T");
  });

  it("Bilibili p=2 and p=3 are different favorites", () => {
    const owner2 = "anon:u_pages" as const;
    addFavorite(owner2, { source: "bili", videoId: "BV_p", page: 2, title: "P2", thumb: null, addedAt: 1, duration: undefined });
    addFavorite(owner2, { source: "bili", videoId: "BV_p", page: 3, title: "P3", thumb: null, addedAt: 2, duration: undefined });
    const list = listFavorites(owner2);
    expect(list).toHaveLength(2);
    expect(new Set(list.map((f) => f.page))).toEqual(new Set([2, 3]));
  });

  it("remove deletes the matching row only", () => {
    const owner3 = "anon:u_remove" as const;
    addFavorite(owner3, { source: "yt", videoId: "y1", page: 0, title: "y1", thumb: null, addedAt: 1 });
    addFavorite(owner3, { source: "yt", videoId: "y2", page: 0, title: "y2", thumb: null, addedAt: 2 });
    const r = removeFavorite(owner3, "yt", "y1", 0);
    expect(r.removed).toBe(true);
    const list = listFavorites(owner3);
    expect(list.map((f) => f.videoId)).toEqual(["y2"]);
  });
});

describe("anon → account merge", () => {
  it("moves rows under the new owner key and deletes the anon ones", () => {
    const accountId = "acct_merge_a";
    const userId = "u_merge_a";
    insertAccount({
      accountId,
      name: "merge_a",
      emoji: "🎤",
      passwordHash: "x",
      createdAt: 1,
    });
    const anon = `anon:${userId}` as const;
    const acct = `acct:${accountId}` as const;
    addFavorite(anon, { source: "bili", videoId: "BV_m1", page: 0, title: "m1", thumb: null, addedAt: 10 });
    addFavorite(anon, { source: "yt", videoId: "ym2", page: 0, title: "m2", thumb: null, addedAt: 11 });
    expect(listFavorites(anon)).toHaveLength(2);
    expect(listFavorites(acct)).toHaveLength(0);

    mergeAnonFavoritesIntoAccount(userId, accountId, 999);

    expect(listFavorites(anon)).toHaveLength(0);
    const merged = listFavorites(acct);
    expect(merged.map((f) => f.videoId).sort()).toEqual(["BV_m1", "ym2"]);
    expect(merged.find((f) => f.videoId === "BV_m1")!.addedAt).toBe(10);
  });

  it("on conflict the account row wins (original added_at preserved)", () => {
    const accountId = "acct_merge_b";
    const userId = "u_merge_b";
    insertAccount({
      accountId,
      name: "merge_b",
      emoji: "🎤",
      passwordHash: "x",
      createdAt: 1,
    });
    const anon = `anon:${userId}` as const;
    const acct = `acct:${accountId}` as const;
    addFavorite(acct, { source: "bili", videoId: "BV_dup", page: 0, title: "ACCT", thumb: null, addedAt: 100 });
    addFavorite(anon, { source: "bili", videoId: "BV_dup", page: 0, title: "ANON", thumb: null, addedAt: 200 });
    mergeAnonFavoritesIntoAccount(userId, accountId, 999);
    const list = listFavorites(acct);
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("ACCT");
    expect(list[0]!.addedAt).toBe(100);
    expect(listFavorites(anon)).toHaveLength(0);
  });
});
