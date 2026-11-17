const COOKIE_NAME = "ameibao_session";
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str) {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  return base64ToBytes(normalized + "=".repeat(padLen));
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(text || "")));
  return new Uint8Array(digest);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function getHmacKey(env) {
  const secretSeed = [
    "ameibao-session-v1",
    env.KITCHEN_PASSWORD || "",
    (env.GITHUB_TOKEN || "local-preview").slice(0, 12),
    env.AUTH_SECRET || ""
  ].join(":");
  const keyBytes = await sha256(secretSeed);
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function verifyPasscode(inputPasscode, env) {
  const expected = env?.KITCHEN_PASSWORD;
  if (!expected || typeof inputPasscode !== "string") return false;
  const [inputHash, expectedHash] = await Promise.all([
    sha256(inputPasscode),
    sha256(expected)
  ]);
  return constantTimeEqual(inputHash, expectedHash);
}

export async function createSessionToken(env) {
  const nonceBytes = new Uint8Array(8);
  crypto.getRandomValues(nonceBytes);
  const payloadObj = {
    v: 1,
    exp: Date.now() + TOKEN_TTL_MS,
    n: toBase64Url(nonceBytes)
  };
  const payloadPart = toBase64Url(encoder.encode(JSON.stringify(payloadObj)));
  const key = await getHmacKey(env);
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadPart));
  const sigPart = toBase64Url(new Uint8Array(sigBuf));
  return `${payloadPart}.${sigPart}`;
}

export async function verifySessionToken(token, env) {
  if (!token || typeof token !== "string" || !env?.KITCHEN_PASSWORD) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadPart, sigPart] = parts;
  if (!payloadPart || !sigPart) return false;
  try {
    const key = await getHmacKey(env);
    const sigBytes = fromBase64Url(sigPart);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payloadPart));
    if (!valid) return false;
    const payload = JSON.parse(decoder.decode(fromBase64Url(payloadPart)));
    if (!payload || typeof payload.exp !== "number" || payload.exp <= Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader) return result;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

export function extractRequestToken(request, allowQueryToken = false) {
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(request.headers.get("Cookie"));
  if (cookies[COOKIE_NAME]) {
    return cookies[COOKIE_NAME];
  }
  if (allowQueryToken) {
    const url = new URL(request.url);
    const qToken = url.searchParams.get("t");
    if (qToken) return qToken;
  }
  return "";
}

function isHttpsRequest(requestOrUrl) {
  if (typeof requestOrUrl === "string") {
    return new URL(requestOrUrl).protocol === "https:";
  }
  const proto = requestOrUrl.headers.get("x-forwarded-proto");
  if (proto) {
    return proto.split(",")[0].trim().toLowerCase() === "https";
  }
  return new URL(requestOrUrl.url).protocol === "https:";
}

export function buildSessionCookieHeader(token, requestOrUrl) {
  const isHttps = isHttpsRequest(requestOrUrl);
  const maxAgeSec = Math.floor(TOKEN_TTL_MS / 1000);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`
  ];
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookieHeader(requestOrUrl) {
  const isHttps = isHttpsRequest(requestOrUrl);
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}

export { bytesToBase64, base64ToBytes };
