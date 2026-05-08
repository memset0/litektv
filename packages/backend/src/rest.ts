import express, { type Request, type Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { parseLink, parseRef } from "./parser.js";
import { RateLimiter } from "./rateLimit.js";
import { getOrFetchThumb } from "./thumbnailCache.js";

const parseLimiter = new RateLimiter(config.rateLimits.parse.perMinute);

// Accept EITHER raw share text (`url`) OR an already-canonical reference
// (`ref`). Sending both is rejected so callers pick one path explicitly.
const parseUrlBody = z.object({
  url: z.string().min(1).max(2048),
  userId: z.string().min(4).max(64).optional(),
});
const parseRefBody = z.object({
  ref: z.object({
    source: z.enum(["yt", "bili"]),
    videoId: z.string().min(1).max(64),
    page: z.number().int().min(1).optional(),
  }),
  userId: z.string().min(4).max(64).optional(),
});

export function createRestRouter(): express.Router {
  const r = express.Router();

  r.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: Date.now() });
  });

  r.post("/api/parse-link", async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "bad request" });
      return;
    }
    if (body.url !== undefined && body.ref !== undefined) {
      res.status(400).json({ error: "supply either url or ref, not both" });
      return;
    }
    const refBody = body.ref !== undefined ? parseRefBody.safeParse(body) : null;
    const urlBody = body.ref === undefined ? parseUrlBody.safeParse(body) : null;
    const validated = refBody ?? urlBody;
    if (!validated || !validated.success) {
      res
        .status(400)
        .json({ error: "bad request", detail: validated?.error.flatten() });
      return;
    }
    const key = validated.data.userId ?? req.ip ?? "anon";
    if (!parseLimiter.allow(key)) {
      res.status(429).json({ error: "rate limited" });
      return;
    }
    try {
      const meta =
        "ref" in validated.data
          ? await parseRef(validated.data.ref)
          : await parseLink(validated.data.url);
      res.json(meta);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "parse failed";
      res.status(400).json({ error: msg });
    }
  });

  r.get("/api/thumb", async (req: Request, res: Response) => {
    const source = req.query.source;
    const id = req.query.id;
    if (typeof source !== "string" || typeof id !== "string" || !id) {
      res.status(400).json({ error: "missing source/id" });
      return;
    }
    if (source !== "yt" && source !== "bili") {
      res.status(400).json({ error: "bad source" });
      return;
    }
    if (id.length > 64) {
      res.status(400).json({ error: "id too long" });
      return;
    }
    try {
      const cached = await getOrFetchThumb(source, id);
      res.setHeader("content-type", cached.mime);
      res.setHeader("cache-control", "public, max-age=86400");
      res.status(200).end(cached.bytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "thumb fetch failed";
      res.status(502).json({ error: msg });
    }
  });

  return r;
}
