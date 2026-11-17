import {
  buildRecipeSummary,
  createEmptyIndex,
  createEmptyWishlist,
  generateRecipeId,
  getSeedRecipes,
  mergeTagsIntoIndex,
  normalizeIndex,
  normalizeIngredientList,
  normalizeSteps,
  normalizeTagNames,
  normalizeWishlist
} from "./store-shared.js";

const GITHUB_API = "https://api.github.com";

function parseRepo(env) {
  const raw = String(env.GITHUB_REPO || "").trim();
  const parts = raw.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("GITHUB_REPO 配置格式应为 用户名/仓库名");
  }
  return {
    owner: parts[0],
    repo: parts[1],
    branch: String(env.GITHUB_BRANCH || "main").trim() || "main"
  };
}

function encodeRepoPath(filePath) {
  return filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function ghFetch(env, apiPath, options = {}) {
  const { method = "GET", body = null, raw = false } = options;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": "Ameibao-Recipes/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
    "Cache-Control": "no-cache",
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json"
  };
  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${GITHUB_API}${apiPath}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined
  });
  return res;
}

async function ghJson(env, apiPath, options = {}) {
  const res = await ghFetch(env, apiPath, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`GitHub API ${res.status}: ${text || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function getHeadRef(env) {
  const { owner, repo, branch } = parseRepo(env);
  const res = await ghFetch(
    env,
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
  );
  if (res.status === 404 || res.status === 409) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`读取 GitHub 分支失败 (${res.status}): ${text}`);
  }
  const refData = await res.json();
  const commitSha = refData?.object?.sha;
  if (!commitSha) return null;
  const commitData = await ghJson(
    env,
    `/repos/${owner}/${repo}/git/commits/${commitSha}`
  );
  return {
    commitSha,
    treeSha: commitData.tree.sha
  };
}

async function ensureInitializedHead(env) {
  const existing = await getHeadRef(env);
  if (existing) return existing;
  const { owner, repo, branch } = parseRepo(env);
  const readmeContent = "# 阿咩豹私房菜谱仓库\n\n由阿咩豹菜谱小站自动维护的数据仓库。\n";
  await ghJson(
    env,
    `/repos/${owner}/${repo}/contents/${encodeRepoPath("data/README.md")}`,
    {
      method: "PUT",
      body: {
        message: "🦭 初始化阿咩豹私房菜谱数据库",
        content: utf8ToBase64(readmeContent),
        branch
      }
    }
  );
  const initialized = await getHeadRef(env);
  if (!initialized) {
    throw new Error("初始化私有仓库分支失败，请检查 GITHUB_BRANCH 与 Token 权限");
  }
  return initialized;
}

async function fileExistsAtCommit(env, filePath, commitSha) {
  const { owner, repo } = parseRepo(env);
  const res = await ghFetch(
    env,
    `/repos/${owner}/${repo}/contents/${encodeRepoPath(filePath)}?ref=${commitSha}`
  );
  return res.ok;
}

async function readJsonAtCommit(env, filePath, commitSha) {
  const { owner, repo } = parseRepo(env);
  if (!commitSha) return null;
  const res = await ghFetch(
    env,
    `/repos/${owner}/${repo}/contents/${encodeRepoPath(filePath)}?ref=${commitSha}`,
    { raw: true }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`读取 ${filePath} 失败 (${res.status}): ${text}`);
  }
  const text = await res.text();
  return JSON.parse(text);
}

async function commitAtomic(env, message, buildChangesFn) {
  const { owner, repo, branch } = parseRepo(env);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const head = await ensureInitializedHead(env);
    const result = await buildChangesFn(head);
    const { changes, responseData } = result;
    if (!changes || changes.length === 0) {
      return responseData;
    }

    const treeEntries = [];
    for (const change of changes) {
      if (change.delete) {
        const exists = await fileExistsAtCommit(env, change.path, head.commitSha);
        if (exists) {
          treeEntries.push({
            path: change.path,
            mode: "100644",
            type: "blob",
            sha: null
          });
        }
      } else {
        const blobPayload =
          change.contentBase64 !== undefined
            ? { content: change.contentBase64, encoding: "base64" }
            : { content: change.contentUtf8, encoding: "utf-8" };
        const blob = await ghJson(env, `/repos/${owner}/${repo}/git/blobs`, {
          method: "POST",
          body: blobPayload
        });
        treeEntries.push({
          path: change.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha
        });
      }
    }

    if (treeEntries.length === 0) {
      return responseData;
    }

    const newTree = await ghJson(env, `/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      body: {
        base_tree: head.treeSha,
        tree: treeEntries
      }
    });

    const newCommit = await ghJson(env, `/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: {
        message,
        tree: newTree.sha,
        parents: [head.commitSha]
      }
    });

    const refRes = await ghFetch(
      env,
      `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        method: "PATCH",
        body: {
          sha: newCommit.sha,
          force: false
        }
      }
    );

    if (refRes.ok) {
      return responseData;
    }
    const refErrText = await refRes.text().catch(() => "");
    if (refRes.status === 422 || refRes.status === 409) {
      lastErr = new Error(`并发冲突重试中: ${refErrText}`);
      continue;
    }
    throw new Error(`提交到 GitHub 失败 (${refRes.status}): ${refErrText}`);
  }
  throw lastErr || new Error("同步冲突，请稍后重试");
}

export function createGithubStore(env) {
  return {
    mode: "github",
    async getBootstrap() {
      const head = await getHeadRef(env);
      if (!head) {
        return {
          index: createEmptyIndex(),
          wishlist: createEmptyWishlist()
        };
      }
      const [rawIndex, rawWishlist] = await Promise.all([
        readJsonAtCommit(env, "data/index.json", head.commitSha),
        readJsonAtCommit(env, "data/wishlist.json", head.commitSha)
      ]);
      return {
        index: normalizeIndex(rawIndex),
        wishlist: normalizeWishlist(rawWishlist)
      };
    },

    async getRecipe(id) {
      const head = await getHeadRef(env);
      if (!head) return null;
      return readJsonAtCommit(env, `data/recipes/${id}.json`, head.commitSha);
    },

    async saveRecipe(input) {
      const isUpdate = Boolean(input.id);
      const recipeId = input.id || generateRecipeId();
      const title = String(input.title || "").trim();
      if (!title) {
        throw new Error("菜名不能为空哦");
      }

      return commitAtomic(
        env,
        `${isUpdate ? "✏️ 更新菜谱" : "🍳 新增菜谱"}：${title}`,
        async (head) => {
          const [rawIndex, existingRecipe, rawWishlist] = await Promise.all([
            readJsonAtCommit(env, "data/index.json", head.commitSha),
            isUpdate
              ? readJsonAtCommit(env, `data/recipes/${recipeId}.json`, head.commitSha)
              : Promise.resolve(null),
            readJsonAtCommit(env, "data/wishlist.json", head.commitSha)
          ]);

          const index = normalizeIndex(rawIndex);
          const now = new Date().toISOString();
          const mainIngredients = normalizeIngredientList(input.mainIngredients);
          const seasonings = normalizeIngredientList(input.seasonings);
          const steps = normalizeSteps(input.steps);
          const tags = normalizeTagNames(input.tags);
          const tips = String(input.tips || "").trim();

          let imagePath = existingRecipe ? existingRecipe.imagePath || null : null;
          const changes = [];

          if (input.imageBase64) {
            const ext = input.imageExt === "png" ? "png" : input.imageExt === "webp" ? "webp" : "jpg";
            const newImagePath = `data/images/${recipeId}_${Date.now().toString(36)}.${ext}`;
            if (imagePath && imagePath !== newImagePath) {
              changes.push({ path: imagePath, delete: true });
            }
            imagePath = newImagePath;
            changes.push({
              path: newImagePath,
              contentBase64: input.imageBase64
            });
          } else if (input.removeImage && imagePath) {
            changes.push({ path: imagePath, delete: true });
            imagePath = null;
          }

          const hasDetails =
            mainIngredients.length > 0 || seasonings.length > 0 || steps.length > 0;
          const status =
            input.status === "draft"
              ? "draft"
              : input.status === "complete"
                ? "complete"
                : hasDetails
                  ? "complete"
                  : "draft";

          const recipe = {
            id: recipeId,
            title,
            tags,
            mainIngredients,
            seasonings,
            steps,
            tips,
            status,
            imagePath,
            cookCount: existingRecipe?.cookCount || 0,
            lastCookedAt: existingRecipe?.lastCookedAt || null,
            createdAt: existingRecipe?.createdAt || now,
            updatedAt: now
          };

          mergeTagsIntoIndex(index, tags);
          const summary = buildRecipeSummary(recipe);
          const pos = index.recipes.findIndex((r) => r.id === recipeId);
          if (pos >= 0) {
            index.recipes[pos] = summary;
          } else {
            index.recipes.unshift(summary);
          }
          index.updatedAt = now;

          changes.push({
            path: `data/recipes/${recipeId}.json`,
            contentUtf8: JSON.stringify(recipe, null, 2)
          });
          changes.push({
            path: "data/index.json",
            contentUtf8: JSON.stringify(index, null, 2)
          });

          // Keep wishlist item title/image synced if this dish is currently in wishlist
          const wishlist = normalizeWishlist(rawWishlist);
          let wishlistChanged = false;
          for (const wItem of wishlist.items) {
            if (wItem.recipeId === recipeId) {
              wItem.title = recipe.title;
              wItem.imagePath = recipe.imagePath;
              wishlistChanged = true;
            }
          }
          if (wishlistChanged) {
            wishlist.updatedAt = now;
            changes.push({
              path: "data/wishlist.json",
              contentUtf8: JSON.stringify(wishlist, null, 2)
            });
          }

          return {
            changes,
            responseData: { recipe, index, wishlist: wishlistChanged ? wishlist : null }
          };
        }
      );
    },

    async deleteRecipe(recipeId) {
      return commitAtomic(env, `🗑️ 删除菜谱：${recipeId}`, async (head) => {
        const [rawIndex, existingRecipe, rawWishlist] = await Promise.all([
          readJsonAtCommit(env, "data/index.json", head.commitSha),
          readJsonAtCommit(env, `data/recipes/${recipeId}.json`, head.commitSha),
          readJsonAtCommit(env, "data/wishlist.json", head.commitSha)
        ]);
        const index = normalizeIndex(rawIndex);
        const now = new Date().toISOString();
        index.recipes = index.recipes.filter((r) => r.id !== recipeId);
        index.updatedAt = now;

        const changes = [
          {
            path: "data/index.json",
            contentUtf8: JSON.stringify(index, null, 2)
          },
          {
            path: `data/recipes/${recipeId}.json`,
            delete: true
          }
        ];
        if (existingRecipe?.imagePath) {
          changes.push({ path: existingRecipe.imagePath, delete: true });
        }

        const wishlist = normalizeWishlist(rawWishlist);
        const prevLen = wishlist.items.length;
        wishlist.items = wishlist.items.filter((i) => i.recipeId !== recipeId);
        if (wishlist.items.length !== prevLen) {
          wishlist.updatedAt = now;
          changes.push({
            path: "data/wishlist.json",
            contentUtf8: JSON.stringify(wishlist, null, 2)
          });
        }

        return {
          changes,
          responseData: { index, wishlist }
        };
      });
    },

    async updateTags(nextTags, renameMap = {}) {
      return commitAtomic(env, "🏷️ 更新菜谱分类标签", async (head) => {
        const rawIndex = await readJsonAtCommit(env, "data/index.json", head.commitSha);
        const index = normalizeIndex(rawIndex);
        const now = new Date().toISOString();
        const cleanTags = [];
        const seen = new Set();
        for (const t of nextTags || []) {
          const name = String(t?.name || "").trim();
          if (!name || seen.has(name)) continue;
          seen.add(name);
          cleanTags.push({
            name,
            emoji: String(t?.emoji || "🏷️").trim() || "🏷️",
            color: String(t?.color || "sky").trim() || "sky"
          });
        }
        index.tags = cleanTags;

        const changes = [];
        const validTagSet = new Set(cleanTags.map((t) => t.name));
        const hasRename = Object.keys(renameMap).length > 0;
        const affectedIds = [];

        for (const summary of index.recipes) {
          const updated = normalizeTagNames(
            (summary.tags || [])
              .map((name) => (renameMap[name] !== undefined ? renameMap[name] : name))
              .filter((name) => !hasRename || validTagSet.has(name) || renameMap[name] === undefined)
          );
          // Also strip deleted tags if removed from tag list
          const finalTags = updated.filter((name) => validTagSet.has(name));
          if (JSON.stringify(finalTags) !== JSON.stringify(summary.tags || [])) {
            summary.tags = finalTags;
            affectedIds.push(summary.id);
          }
        }

        // Update affected individual recipe JSON files in batches
        for (let i = 0; i < affectedIds.length; i += 8) {
          const batch = affectedIds.slice(i, i + 8);
          const loaded = await Promise.all(
            batch.map((id) =>
              readJsonAtCommit(env, `data/recipes/${id}.json`, head.commitSha)
            )
          );
          for (const rec of loaded) {
            if (!rec) continue;
            const summaryMatch = index.recipes.find((r) => r.id === rec.id);
            rec.tags = summaryMatch ? summaryMatch.tags : [];
            rec.updatedAt = now;
            changes.push({
              path: `data/recipes/${rec.id}.json`,
              contentUtf8: JSON.stringify(rec, null, 2)
            });
          }
        }

        index.updatedAt = now;
        changes.push({
          path: "data/index.json",
          contentUtf8: JSON.stringify(index, null, 2)
        });
        return { changes, responseData: { index } };
      });
    },

    async mutateWishlist(mutatorFn, commitMsg = "💛 更新想吃清单") {
      return commitAtomic(env, commitMsg, async (head) => {
        const [rawIndex, rawWishlist] = await Promise.all([
          readJsonAtCommit(env, "data/index.json", head.commitSha),
          readJsonAtCommit(env, "data/wishlist.json", head.commitSha)
        ]);
        const index = normalizeIndex(rawIndex);
        const wishlist = normalizeWishlist(rawWishlist);
        const now = new Date().toISOString();

        const extra = await mutatorFn({ index, wishlist, head, now });
        wishlist.updatedAt = now;

        const changes = [
          {
            path: "data/wishlist.json",
            contentUtf8: JSON.stringify(wishlist, null, 2)
          }
        ];
        let indexChanged = false;

        if (extra?.cookedRecipeId) {
          const cookedId = extra.cookedRecipeId;
          const rec = await readJsonAtCommit(
            env,
            `data/recipes/${cookedId}.json`,
            head.commitSha
          );
          if (rec) {
            rec.cookCount = (rec.cookCount || 0) + 1;
            rec.lastCookedAt = now;
            rec.updatedAt = now;
            changes.push({
              path: `data/recipes/${cookedId}.json`,
              contentUtf8: JSON.stringify(rec, null, 2)
            });
          }
          const summary = index.recipes.find((r) => r.id === cookedId);
          if (summary) {
            summary.cookCount = (summary.cookCount || 0) + 1;
            summary.updatedAt = now;
            index.updatedAt = now;
            indexChanged = true;
          }
        }

        if (indexChanged) {
          changes.push({
            path: "data/index.json",
            contentUtf8: JSON.stringify(index, null, 2)
          });
        }

        return {
          changes,
          responseData: {
            wishlist,
            index: indexChanged ? index : null
          }
        };
      });
    },

    async seedStarterRecipes() {
      return commitAtomic(env, "🦭 阿咩豹摆上 3 道示例菜", async (head) => {
        const rawIndex = await readJsonAtCommit(env, "data/index.json", head.commitSha);
        const index = normalizeIndex(rawIndex);
        const existingIds = new Set(index.recipes.map((r) => r.id));
        const seeds = getSeedRecipes();
        const changes = [];
        let addedCount = 0;

        for (const seed of seeds) {
          if (existingIds.has(seed.id)) continue;
          mergeTagsIntoIndex(index, seed.tags);
          index.recipes.push(buildRecipeSummary(seed));
          changes.push({
            path: `data/recipes/${seed.id}.json`,
            contentUtf8: JSON.stringify(seed, null, 2)
          });
          addedCount += 1;
        }

        if (addedCount > 0) {
          index.updatedAt = new Date().toISOString();
          changes.push({
            path: "data/index.json",
            contentUtf8: JSON.stringify(index, null, 2)
          });
        }

        return { changes, responseData: { index, addedCount } };
      });
    },

    async readImage(imagePath) {
      const { owner, repo, branch } = parseRepo(env);
      const res = await ghFetch(
        env,
        `/repos/${owner}/${repo}/contents/${encodeRepoPath(imagePath)}?ref=${encodeURIComponent(branch)}`,
        { raw: true }
      );
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`读取图片失败 (${res.status})`);
      }
      const bytes = await res.arrayBuffer();
      const ext = imagePath.split(".").pop()?.toLowerCase();
      const contentType =
        ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";
      return { bytes, contentType };
    }
  };
}
