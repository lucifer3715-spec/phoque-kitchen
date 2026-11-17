import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./server/router.js";
import { createLocalStore } from "./server/local-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const LOCAL_DB_DIR = path.join(__dirname, ".local-db");
const PORT = Number(process.env.PORT || 8788);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

async function loadDevVars() {
  const env = { ...process.env };
  for (const filename of [".env", ".dev.vars"]) {
    try {
      const raw = await fs.readFile(path.join(__dirname, filename), "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!(key in env)) {
          env[key] = val;
        }
      }
    } catch {
      // optional env file
    }
  }
  return env;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveStatic(reqPath, res) {
  let cleanPath = decodeURIComponent(reqPath.split("?")[0]);
  if (cleanPath === "/") cleanPath = "/index.html";
  const resolved = path.resolve(PUBLIC_DIR, `.${cleanPath}`);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const stat = await fs.stat(resolved);
    const filePath = stat.isDirectory() ? path.join(resolved, "index.html") : resolved;
    const ext = path.extname(filePath).toLowerCase();
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  } catch {
    // Fallback to index.html for SPA routes
    const indexHtml = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(indexHtml);
  }
}

const env = await loadDevVars();
const listenHost = env.HOST || "127.0.0.1";
const listenPort = Number(env.PORT || PORT);
const dataDir = env.DATA_DIR ? path.resolve(__dirname, env.DATA_DIR) : LOCAL_DB_DIR;
const hasGithub = Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO);
if (!hasGithub && !env.KITCHEN_PASSWORD) {
  env.KITCHEN_PASSWORD = "ameibao";
}
const injectedStore = hasGithub ? null : createLocalStore(dataDir);

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `${listenHost}:${listenPort}`;
    const forwardedProto = req.headers["x-forwarded-proto"];
    const proto =
      typeof forwardedProto === "string" && forwardedProto.split(",")[0].trim() === "https"
        ? "https"
        : "http";
    const fullUrl = `${proto}://${host}${req.url || "/"}`;
    const url = new URL(fullUrl);

    if (url.pathname.startsWith("/api/")) {
      const method = (req.method || "GET").toUpperCase();
      const bodyBuf =
        method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined) {
          headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        }
      }
      const webRequest = new Request(fullUrl, {
        method,
        headers,
        body: bodyBuf && bodyBuf.length > 0 ? bodyBuf : undefined
      });

      const webResponse = await handleApiRequest(
        { request: webRequest, env },
        injectedStore
      );
      const outHeaders = {};
      webResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") {
          outHeaders[key] = value;
        }
      });
      if (typeof webResponse.headers.getSetCookie === "function") {
        const cookies = webResponse.headers.getSetCookie();
        if (cookies.length > 0) outHeaders["Set-Cookie"] = cookies;
      } else if (webResponse.headers.has("set-cookie")) {
        outHeaders["Set-Cookie"] = webResponse.headers.get("set-cookie");
      }

      const buf = Buffer.from(await webResponse.arrayBuffer());
      res.writeHead(webResponse.status, outHeaders);
      res.end(buf);
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: err?.message || "Internal error" }));
  }
});

server.listen(listenPort, listenHost, () => {
  console.log(`\n🦭 阿咩豹私房菜谱服务已启动：http://${listenHost}:${listenPort}`);
  if (hasGithub) {
    console.log(`📦 存储模式：GitHub 私有仓库 (${env.GITHUB_REPO})`);
  } else {
    console.log(`📁 存储模式：服务器本地目录 (${dataDir})`);
    console.log(`🔑 当前家庭密码：${env.KITCHEN_PASSWORD}`);
  }
});
