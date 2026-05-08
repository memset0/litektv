import express, { type Request, type Response } from "express";
import { z } from "zod";
import { AuthError, login as authLogin, signup as authSignup } from "./authService.js";
import { config } from "./config.js";
import { parseLink, parseRef, thumbUrlFor } from "./parser.js";
import { RateLimiter } from "./rateLimit.js";

const parseLimiter = new RateLimiter(config.rateLimits.parse.perMinute);
const authIpLimiter = new RateLimiter(config.rateLimits["auth.ip"].perMinute);
const authNameLimiter = new RateLimiter(config.rateLimits["auth.name"].perMinute);

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

  const authBody = z.object({
    name: z.string().min(3).max(24),
    password: z.string().min(8).max(200),
    emoji: z.string().max(8).optional(),
    userId: z.string().min(4).max(64).optional(),
  });

  const authHandler = (kind: "signup" | "login") => async (req: Request, res: Response) => {
    const parsed = authBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad request", detail: parsed.error.flatten() });
      return;
    }
    const ip = req.ip ?? "unknown";
    if (
      !authIpLimiter.allow(`ip:${ip}`) ||
      !authNameLimiter.allow(`name:${parsed.data.name.toLowerCase()}`)
    ) {
      res.status(429).json({ error: "rate limited" });
      return;
    }
    try {
      const ok =
        kind === "signup"
          ? await authSignup(parsed.data)
          : await authLogin(parsed.data);
      res.json(ok);
    } catch (e) {
      const msg = e instanceof AuthError ? e.message : `${kind} failed`;
      res.status(400).json({ error: msg });
    }
  };

  r.post("/api/auth/signup", authHandler("signup"));
  r.post("/api/auth/login", authHandler("login"));

  return r;
}
