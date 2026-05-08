import express, { type Request, type Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { parseLink, thumbUrlFor } from "./parser.js";
import { RateLimiter } from "./rateLimit.js";

const parseLimiter = new RateLimiter(config.rateLimits.parse.perMinute);

const parseBody = z.object({
  // Accept raw share text (e.g. "【title】 https://b23.tv/...") — the parser
  // extracts the URL itself. Cap length so the bucket can't be abused.
  url: z.string().min(1).max(2048),
  userId: z.string().min(4).max(64).optional(),
});

export function createRestRouter(): express.Router {
  const r = express.Router();

  r.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: Date.now() });
  });

  r.post("/api/parse-link", async (req: Request, res: Response) => {
    const parsed = parseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad request", detail: parsed.error.flatten() });
      return;
    }
    const key = parsed.data.userId ?? req.ip ?? "anon";
    if (!parseLimiter.allow(key)) {
      res.status(429).json({ error: "rate limited" });
      return;
    }
    try {
      const meta = await parseLink(parsed.data.url);
      res.json(meta);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "parse failed";
      res.status(400).json({ error: msg });
    }
  });

  r.get("/api/thumb", (req: Request, res: Response) => {
    const source = req.query.source;
    const id = req.query.id;
    if (typeof source !== "string" || typeof id !== "string") {
      res.status(400).json({ error: "missing source/id" });
      return;
    }
    if (source !== "yt" && source !== "bili") {
      res.status(400).json({ error: "bad source" });
      return;
    }
    const target = thumbUrlFor(source, id);
    if (!target) {
      res.status(404).json({ error: "no thumb url for source" });
      return;
    }
    res.setHeader("cache-control", "public, max-age=86400");
    res.redirect(302, target);
  });

  return r;
}
