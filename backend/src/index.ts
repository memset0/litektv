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
  app.use(
    express.static(path.resolve(config.staticDir), {
      index: ["KTV.html", "index.html"],
    }),
  );
}

const server = http.createServer(app);
attachWs(server);

setInterval(gcRooms, 5 * 60 * 1000).unref();

server.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`[litektv-backend] listening on http://${config.host}:${config.port}`);
});
