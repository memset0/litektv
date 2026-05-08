import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { createRestRouter } from "./rest.js";
import { gcRooms, restoreRooms } from "./rooms.js";
import { attachWs } from "./ws.js";

initDb();
restoreRooms();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(createRestRouter());

const server = http.createServer(app);

const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED = new Set(["api", "ws", "favicon.ico", "robots.txt", "sitemap.xml"]);

// In dev, the frontend source lives at packages/frontend/ relative to this
// file. import.meta.dirname is the absolute path to packages/backend/src/
// (when running via tsx) or packages/backend/dist/ (when running compiled).
// Both resolve to the same packages/frontend/.
const FRONTEND_ROOT = path.resolve(import.meta.dirname, "../../frontend");

let viteDev: import("vite").ViteDevServer | null = null;
let staticRoot: string | null = null;

async function serveSpa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (viteDev) {
      const indexPath = path.join(FRONTEND_ROOT, "index.html");
      const raw = await fs.promises.readFile(indexPath, "utf-8");
      const html = await viteDev.transformIndexHtml(req.originalUrl, raw);
      res.status(200).setHeader("Content-Type", "text/html").end(html);
      return;
    }
    if (staticRoot) {
      res.sendFile(path.join(staticRoot, "index.html"));
      return;
    }
    res.status(503).send("STATIC_DIR not configured and not running in dev mode");
  } catch (e) {
    if (viteDev) viteDev.ssrFixStacktrace(e as Error);
    next(e);
  }
}

// Single-segment slug-shaped paths (and `/`) get the SPA. Multi-segment,
// dotted, and reserved paths fall through (express returns 404). This
// preserves the room-routing capability's invariants — `/missing.png` and
// `/api/whatever` never get the SPA HTML.
function spaHandler(req: Request, res: Response, next: NextFunction): void {
  const segs = req.path.split("/").filter(Boolean);
  if (segs.length === 0) {
    void serveSpa(req, res, next);
    return;
  }
  if (segs.length > 1) return next();
  const slug = segs[0]!;
  if (slug.includes(".") || RESERVED.has(slug) || !SLUG_RE.test(slug)) return next();
  void serveSpa(req, res, next);
}

async function setup(): Promise<void> {
  if (config.devMode) {
    const { createServer: createVite } = await import("vite");
    viteDev = await createVite({
      root: FRONTEND_ROOT,
      server: {
        middlewareMode: true,
        hmr: { server },
        // Accept any Host header. The dev backend lives behind Caddy
        // (`ktv.dev.mem.ac → 127.0.0.1:38117`), so requests carry the
        // public hostname. Vite 5 defaults to "auto" which only permits
        // localhost; that would 403 every external visit.
        allowedHosts: true,
      },
      appType: "custom",
    });
    app.use(viteDev.middlewares);
  } else if (config.staticDir) {
    staticRoot = path.resolve(config.staticDir);
    // index: false — SPA handler below serves index.html explicitly so the
    // dev/prod paths share one code path.
    app.use(express.static(staticRoot, { index: false, fallthrough: true }));
  }

  app.get("*", spaHandler);

  attachWs(server, { fallthroughForeignPaths: config.devMode });

  setInterval(gcRooms, 5 * 60 * 1000).unref();

  server.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[litektv-backend] listening on http://${config.host}:${config.port} (${config.devMode ? "dev: vite middleware" : "prod: static dist"})`,
    );
  });
}

setup().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[litektv-backend] failed to start:", e);
  process.exit(1);
});
