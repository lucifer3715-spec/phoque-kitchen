const TOKEN_KEY = "ameibao_session_token_v1";
const DATA_CACHE_KEY = "ameibao_kitchen_cache_v1";

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export function loadOfflineSnapshot() {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveOfflineSnapshot(snapshot) {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota errors
  }
}

export function clearOfflineData() {
  setStoredToken("");
  try {
    localStorage.removeItem(DATA_CACHE_KEY);
  } catch {
    // ignore
  }
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_USER_CACHE" });
  }
}

export function buildImageUrl(imagePath) {
  if (!imagePath) return "";
  const token = getStoredToken();
  const qs = new URLSearchParams({ path: imagePath });
  if (token) qs.set("t", token);
  return `/api/image?${qs.toString()}`;
}

async function apiRequest(path, options = {}) {
  const { method = "GET", body = null } = options;
  const headers = { ...(options.headers || {}) };
  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: body !== null ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `请求失败 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  health() {
    return apiRequest("/api/health");
  },
  checkAuth() {
    return apiRequest("/api/auth/check");
  },
  async login(passcode) {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { passcode }
    });
    if (data?.token) {
      setStoredToken(data.token);
    }
    return data;
  },
  async logout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      clearOfflineData();
    }
  },
  bootstrap() {
    return apiRequest("/api/bootstrap");
  },
  getRecipe(id) {
    return apiRequest(`/api/recipes/${encodeURIComponent(id)}`);
  },
  createRecipe(payload) {
    return apiRequest("/api/recipes", { method: "POST", body: payload });
  },
  updateRecipe(id, payload) {
    return apiRequest(`/api/recipes/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: payload
    });
  },
  deleteRecipe(id) {
    return apiRequest(`/api/recipes/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },
  updateTags(tags, renameMap = {}) {
    return apiRequest("/api/tags", {
      method: "PUT",
      body: { tags, renameMap }
    });
  },
  addWishlist(recipeId, note = "") {
    return apiRequest("/api/wishlist/add", {
      method: "POST",
      body: { recipeId, note }
    });
  },
  removeWishlist(recipeId) {
    return apiRequest("/api/wishlist/remove", {
      method: "POST",
      body: { recipeId }
    });
  },
  checkPantry(payload) {
    return apiRequest("/api/wishlist/check-pantry", {
      method: "POST",
      body: payload
    });
  },
  mutateCustomItem(payload) {
    return apiRequest("/api/wishlist/custom-item", {
      method: "POST",
      body: payload
    });
  },
  markCooked(recipeId) {
    return apiRequest("/api/wishlist/cook", {
      method: "POST",
      body: { recipeId }
    });
  },
  seedStarters() {
    return apiRequest("/api/seed", { method: "POST" });
  },
  exportBackup() {
    return apiRequest("/api/export");
  }
};

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片压缩失败"));
      },
      type,
      quality
    );
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const idx = dataUrl.indexOf(",");
      resolve({
        dataUrl,
        base64: idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
      });
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}

export async function compressImageFile(file, { maxDim = 1200, quality = 0.82 } = {}) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = objectUrl;
    if (typeof img.decode === "function") {
      await img.decode();
    } else {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    }

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFDF8";
    ctx.fillRect(0, 0, dstW, dstH);
    ctx.drawImage(img, 0, 0, dstW, dstH);

    let blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob.size > 380 * 1024) {
      blob = await canvasToBlob(canvas, "image/jpeg", 0.72);
    }
    const { dataUrl, base64 } = await blobToBase64(blob);
    return {
      base64,
      dataUrl,
      ext: "jpg",
      originalBytes: file.size,
      compressedBytes: blob.size,
      width: dstW,
      height: dstH
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
