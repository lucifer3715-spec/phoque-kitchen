import {
  buildClearCookieHeader,
  buildSessionCookieHeader,
  createSessionToken,
  extractRequestToken,
  verifyPasscode,
  verifySessionToken
} from "./auth.js";
import { createGithubStore } from "./github-store.js";

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isValidRecipeId(id) {
  return /^[a-zA-Z0-9_-]{3,80}$/.test(String(id || ""));
}

function isValidImagePath(filePath) {
  return /^data\/images\/[a-zA-Z0-9_.-]+$/.test(String(filePath || "")) && !filePath.includes("..");
}

function resolveStore(env, injectedStore) {
  if (injectedStore) return injectedStore;
  return createGithubStore(env);
}

function checkEnvConfig(env, injectedStore) {
  if (injectedStore) {
    return {
      configured: Boolean(env.KITCHEN_PASSWORD),
      mode: "local",
      missing: env.KITCHEN_PASSWORD ? [] : ["KITCHEN_PASSWORD"]
    };
  }
  const missing = [];
  if (!env.KITCHEN_PASSWORD) missing.push("KITCHEN_PASSWORD");
  if (!env.GITHUB_TOKEN) missing.push("GITHUB_TOKEN");
  if (!env.GITHUB_REPO) missing.push("GITHUB_REPO");
  return {
    configured: missing.length === 0,
    mode: "github",
    missing
  };
}

export async function handleApiRequest(context, injectedStore = null) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();
  const configStatus = checkEnvConfig(env, injectedStore);

  try {
    if (method === "GET" && pathname === "/api/health") {
      return jsonResponse({ ok: true, ...configStatus });
    }

    if (method === "POST" && pathname === "/api/auth/login") {
      if (!env.KITCHEN_PASSWORD) {
        return jsonResponse(
          {
            ok: false,
            error: "服务器还没有配置家庭密码（KITCHEN_PASSWORD），请先按部署指南填写环境变量。"
          },
          503
        );
      }
      const body = await readJsonBody(request);
      const ok = await verifyPasscode(body?.passcode, env);
      if (!ok) {
        return jsonResponse({ ok: false, error: "暗号不对哦，阿咩豹记错了吗？" }, 401);
      }
      const token = await createSessionToken(env);
      return jsonResponse(
        { ok: true, token, mode: configStatus.mode },
        200,
        { "Set-Cookie": buildSessionCookieHeader(token, request) }
      );
    }

    if (method === "POST" && pathname === "/api/auth/logout") {
      return jsonResponse(
        { ok: true },
        200,
        { "Set-Cookie": buildClearCookieHeader(request) }
      );
    }

    const isImageEndpoint = method === "GET" && pathname === "/api/image";
    const token = extractRequestToken(request, isImageEndpoint);
    const authed = await verifySessionToken(token, env);

    if (method === "GET" && pathname === "/api/auth/check") {
      return jsonResponse({ ok: true, authenticated: authed, ...configStatus });
    }

    if (!authed) {
      return jsonResponse({ ok: false, error: "需要输入家庭密码解锁才能看菜谱哦" }, 401);
    }

    if (!configStatus.configured) {
      return jsonResponse(
        {
          ok: false,
          error: `缺少后台环境变量：${configStatus.missing.join(", ")}`
        },
        503
      );
    }

    const store = resolveStore(env, injectedStore);

    if (method === "GET" && pathname === "/api/bootstrap") {
      const data = await store.getBootstrap();
      return jsonResponse({ ok: true, mode: store.mode, ...data });
    }

    if (isImageEndpoint) {
      const imagePath = url.searchParams.get("path") || "";
      if (!isValidImagePath(imagePath)) {
        return jsonResponse({ ok: false, error: "无效的图片路径" }, 400);
      }
      const img = await store.readImage(imagePath);
      if (!img) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(img.bytes, {
        status: 200,
        headers: {
          "Content-Type": img.contentType,
          "Cache-Control": "private, max-age=31536000, immutable"
        }
      });
    }

    if (method === "POST" && pathname === "/api/seed") {
      const res = await store.seedStarterRecipes();
      return jsonResponse({ ok: true, ...res });
    }

    if (method === "PUT" && pathname === "/api/tags") {
      const body = await readJsonBody(request);
      if (!Array.isArray(body?.tags)) {
        return jsonResponse({ ok: false, error: "标签格式无效" }, 400);
      }
      const res = await store.updateTags(body.tags, body.renameMap || {});
      return jsonResponse({ ok: true, ...res });
    }

    if (method === "POST" && pathname === "/api/recipes") {
      const body = await readJsonBody(request);
      if (!body || !String(body.title || "").trim()) {
        return jsonResponse({ ok: false, error: "请先写上菜名哦" }, 400);
      }
      if (body.imageBase64 && body.imageBase64.length > 3_500_000) {
        return jsonResponse({ ok: false, error: "图片太大啦，请压缩后再上传" }, 400);
      }
      const res = await store.saveRecipe({ ...body, id: undefined });
      return jsonResponse({ ok: true, ...res }, 201);
    }

    const recipeMatch = pathname.match(/^\/api\/recipes\/([^/]+)$/);
    if (recipeMatch) {
      const id = decodeURIComponent(recipeMatch[1]);
      if (!isValidRecipeId(id)) {
        return jsonResponse({ ok: false, error: "无效的菜谱 ID" }, 400);
      }
      if (method === "GET") {
        const recipe = await store.getRecipe(id);
        if (!recipe) {
          return jsonResponse({ ok: false, error: "找不到这道菜" }, 404);
        }
        return jsonResponse({ ok: true, recipe });
      }
      if (method === "PUT") {
        const body = await readJsonBody(request);
        if (!body || !String(body.title || "").trim()) {
          return jsonResponse({ ok: false, error: "请先写上菜名哦" }, 400);
        }
        if (body.imageBase64 && body.imageBase64.length > 3_500_000) {
          return jsonResponse({ ok: false, error: "图片太大啦，请压缩后再上传" }, 400);
        }
        const res = await store.saveRecipe({ ...body, id });
        return jsonResponse({ ok: true, ...res });
      }
      if (method === "DELETE") {
        const res = await store.deleteRecipe(id);
        return jsonResponse({ ok: true, ...res });
      }
    }

    if (method === "POST" && pathname === "/api/wishlist/add") {
      const body = await readJsonBody(request);
      const recipeId = String(body?.recipeId || "");
      if (!isValidRecipeId(recipeId)) {
        return jsonResponse({ ok: false, error: "无效的菜谱 ID" }, 400);
      }
      const note = String(body?.note || "").trim().slice(0, 80);
      const res = await store.mutateWishlist(({ index, wishlist, now }) => {
        const summary = index.recipes.find((r) => r.id === recipeId);
        if (!summary) {
          throw new Error("菜谱好像已经被删除了");
        }
        const existing = wishlist.items.find((i) => i.recipeId === recipeId);
        if (existing) {
          existing.note = note || existing.note;
          existing.title = summary.title;
          existing.imagePath = summary.imagePath;
        } else {
          wishlist.items.unshift({
            recipeId,
            title: summary.title,
            imagePath: summary.imagePath,
            note,
            addedAt: now
          });
        }
      }, `💛 想吃：${recipeId}`);
      return jsonResponse({ ok: true, ...res });
    }

    if (method === "POST" && pathname === "/api/wishlist/remove") {
      const body = await readJsonBody(request);
      const recipeId = String(body?.recipeId || "");
      const res = await store.mutateWishlist(({ wishlist }) => {
        wishlist.items = wishlist.items.filter((i) => i.recipeId !== recipeId);
      }, "📝 移出想吃清单");
      return jsonResponse({ ok: true, ...res });
    }

    if (method === "POST" && pathname === "/api/wishlist/check-pantry") {
      const body = await readJsonBody(request);
      const res = await store.mutateWishlist(({ wishlist }) => {
        if (body?.clearChecked) {
          wishlist.checkedIngredients = {};
          return;
        }
        if (body?.updates && typeof body.updates === "object") {
          for (const [k, v] of Object.entries(body.updates)) {
            if (v) wishlist.checkedIngredients[k] = true;
            else delete wishlist.checkedIngredients[k];
          }
          return;
        }
        const key = String(body?.key || "").trim();
        if (key) {
          if (body.checked) wishlist.checkedIngredients[key] = true;
          else delete wishlist.checkedIngredients[key];
        }
      }, "🛒 更新备料勾选状态");
      return jsonResponse({ ok: true, ...res });
    }

    if (method === "POST" && pathname === "/api/wishlist/custom-item") {
      const body = await readJsonBody(request);
      const action = body?.action;
      const res = await store.mutateWishlist(({ wishlist, now }) => {
        if (action === "add") {
          const text = String(body?.text || "").trim().slice(0, 60);
          if (!text) return;
          wishlist.customItems.push({
            id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
            text,
            checked: false,
            addedAt: now
          });
        } else if (action === "toggle") {
          const item = wishlist.customItems.find((i) => i.id === body?.id);
          if (item) item.checked = !item.checked;
        } else if (action === "remove") {
          wishlist.customItems = wishlist.customItems.filter((i) => i.id !== body?.id);
        } else if (action === "clearChecked") {
          wishlist.customItems = wishlist.customItems.filter((i) => !i.checked);
        }
      }, "🧺 更新临时采买清单");
      return jsonResponse({ ok: true, ...res });
    }

    if (method === "POST" && pathname === "/api/wishlist/cook") {
      const body = await readJsonBody(request);
      const recipeId = String(body?.recipeId || "");
      if (!isValidRecipeId(recipeId)) {
        return jsonResponse({ ok: false, error: "无效的菜谱 ID" }, 400);
      }
      const res = await store.mutateWishlist(({ index, wishlist, now }) => {
        const item = wishlist.items.find((i) => i.recipeId === recipeId);
        const summary = index.recipes.find((r) => r.id === recipeId);
        const title = item?.title || summary?.title || "美味菜肴";
        wishlist.items = wishlist.items.filter((i) => i.recipeId !== recipeId);
        wishlist.feedCount = (wishlist.feedCount || 0) + 1;
        wishlist.history = [
          { recipeId, title, cookedAt: now },
          ...(wishlist.history || [])
        ].slice(0, 50);
        return { cookedRecipeId: recipeId };
      }, `🦭 投喂阿咩豹：完成 ${recipeId}`);
      return jsonResponse({ ok: true, ...res });
    }

    if (method === "GET" && pathname === "/api/export") {
      const bootstrap = await store.getBootstrap();
      const recipes = [];
      const ids = bootstrap.index.recipes.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 8) {
        const batch = await Promise.all(ids.slice(i, i + 8).map((id) => store.getRecipe(id)));
        for (const r of batch) {
          if (r) recipes.push(r);
        }
      }
      return jsonResponse({
        ok: true,
        exportedAt: new Date().toISOString(),
        tags: bootstrap.index.tags,
        recipes,
        wishlist: bootstrap.wishlist
      });
    }

    return jsonResponse({ ok: false, error: "未找到对应接口" }, 404);
  } catch (err) {
    const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    return jsonResponse(
      { ok: false, error: err?.message || "服务开小差啦，请稍后再试" },
      status
    );
  }
}
