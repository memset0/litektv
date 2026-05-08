import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLink, parseRef } from "./parser.js";

const ALLOWED_KEYS = ["source", "videoId", "page", "title", "thumb", "duration"];

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    return handler(url);
  }) as typeof fetch;
}

describe("parseLink canonicalization", () => {
  beforeEach(() => {
    mockFetch((url) => {
      // Bilibili web-interface/view stub
      if (url.startsWith("https://api.bilibili.com/x/web-interface/view")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              title: "test bili title",
              pic: "https://i0.hdslb.com/bfs/archive/abc.jpg",
              duration: 234,
              pages: [{ page: 1, part: "P1", duration: 234 }],
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      // YouTube oEmbed stub
      if (url.startsWith("https://www.youtube.com/oembed")) {
        return new Response(
          JSON.stringify({
            title: "test yt title",
            thumbnail_url: "https://i.ytimg.com/vi/X/hqdefault.jpg",
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("strips spm_id_from / vd_source from a Bilibili share URL", async () => {
    const meta = await parseLink(
      "https://www.bilibili.com/video/BV1y2q6YWEGp/?spm_id_from=..search-card.all.click&vd_source=6f64410c2ccb33424242f5eeeb74eb8c",
    );
    expect(meta.source).toBe("bili");
    expect(meta.videoId).toBe("BV1y2q6YWEGp");
    expect(meta.page).toBe(1);
    // Result must contain only the allowlisted keys (no echoed URL / params).
    for (const k of Object.keys(meta)) {
      expect(ALLOWED_KEYS).toContain(k);
    }
    // And explicitly: no tracking-ish strings carried through.
    const blob = JSON.stringify(meta);
    expect(blob).not.toContain("spm_id_from");
    expect(blob).not.toContain("vd_source");
  });

  it("strips si / pp / t from a YouTube watch URL", async () => {
    const meta = await parseLink(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=ABC&pp=XYZ&t=42s",
    );
    expect(meta.source).toBe("yt");
    expect(meta.videoId).toBe("dQw4w9WgXcQ");
    for (const k of Object.keys(meta)) {
      expect(ALLOWED_KEYS).toContain(k);
    }
    const blob = JSON.stringify(meta);
    expect(blob).not.toContain("si=");
    expect(blob).not.toContain("pp=XYZ");
    expect(blob).not.toContain("t=42s");
  });

  it("preserves Bilibili ?p= page index", async () => {
    const meta = await parseLink(
      "https://www.bilibili.com/video/BV1y2q6YWEGp/?p=2&spm_id_from=junk",
    );
    expect(meta.source).toBe("bili");
    expect(meta.videoId).toBe("BV1y2q6YWEGp");
    expect(meta.page).toBe(2);
  });
});

describe("parseRef", () => {
  beforeEach(() => {
    // Track every URL fetched so we can assert no redirect resolution happens.
    const seen: string[] = [];
    (globalThis as unknown as { __seen: string[] }).__seen = seen;
    mockFetch((url) => {
      seen.push(url);
      if (url.startsWith("https://api.bilibili.com/x/web-interface/view")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: { title: "ref title", pic: null, duration: 100, pages: [{ page: 1, part: "P1", duration: 100 }] },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://www.youtube.com/oembed")) {
        return new Response(
          JSON.stringify({ title: "ref yt", thumbnail_url: "" }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("does not hit the redirect resolver for canonical refs", async () => {
    await parseRef({ source: "bili", videoId: "BV1y2q6YWEGp", page: 1 });
    const seen = (globalThis as unknown as { __seen: string[] }).__seen;
    // Only the metadata fetch should have happened.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/api\.bilibili\.com/);
  });

  it("returns the same canonical shape for a YouTube ref", async () => {
    const meta = await parseRef({ source: "yt", videoId: "dQw4w9WgXcQ" });
    expect(meta.source).toBe("yt");
    expect(meta.videoId).toBe("dQw4w9WgXcQ");
    for (const k of Object.keys(meta)) {
      expect(ALLOWED_KEYS).toContain(k);
    }
  });
});
