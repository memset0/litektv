import http from "node:http";
import path from "node:path";
import express from "express";
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

if (config.staticDir) {
  const root = path.resolve(config.staticDir);
  app.use(
    express.static(root, {
      index: ["KTV.html", "index.html"],
    }),
  );
  // Pretty room URLs: /<slug> serves the SPA so the frontend can read the
  // pathname as the room id. Static is registered first so real assets
  // (KTV.html, state.jsx, ktv.css, etc.) win; this only fires when no file
  // matched. Names with a dot (looks like a missing asset) and a small set
  // of reserved words are excluded.
  const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const RESERVED = new Set(["api", "ws", "favicon.ico", "robots.txt", "sitemap.xml"]);
  app.get("/:slug", (req, res, next) => {
    const slug = req.params.slug;
    if (!SLUG_RE.test(slug) || slug.includes(".") || RESERVED.has(slug)) return next();
    res.sendFile(path.join(root, "KTV.html"));
  });
}

const server = http.createServer(app);
attachWs(server);

setInterval(gcRooms, 5 * 60 * 1000).unref();

server.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`[litektv-backend] listening on http://${config.host}:${config.port}`);
});
