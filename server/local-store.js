import fs from "node:fs/promises";
import path from "node:path";
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

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonSafe(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    return JSON.parse(text);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(filePath, obj) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2), "utf-8");
}

async function unlinkSafe(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

export function createLocalStore(rootDir) {
  const dbDir = path.resolve(rootDir);
  let writeChain = Promise.resolve();

  function withWriteLock(fn) {
    const run = writeChain.then(fn, fn);
    writeChain = run.catch(() => {});
    return run;
  }

  function resolveSafe(relPath) {
    const target = path.resolve(dbDir, relPath);
    if (!target.startsWith(dbDir + path.sep) && target !== dbDir) {
      throw new Error("非法路径");
    }
    return target;
  }

  return {
    mode: "local",

    async getBootstrap() {
      const [rawIndex, rawWishlist] = await Promise.all([
        readJsonSafe(resolveSafe("data/index.json")),
        readJsonSafe(resolveSafe("data/wishlist.json"))
      ]);
      return {
        index: normalizeIndex(rawIndex),
        wishlist: normalizeWishlist(rawWishlist)
      };
    },

    async getRecipe(id) {
      return readJsonSafe(resolveSafe(`data/recipes/${id}.json`));
    },

    saveRecipe(input) {
      return withWriteLock(async () => {
      const isUpdate = Boolean(input.id);
      const recipeId = input.id || generateRecipeId();
      const title = String(input.title || "").trim();
      if (!title) throw new Error("菜名不能为空哦");

      const [rawIndex, existingRecipe, rawWishlist] = await Promise.all([
        readJsonSafe(resolveSafe("data/index.json")),
        isUpdate
          ? readJsonSafe(resolveSafe(`data/recipes/${recipeId}.json`))
          : Promise.resolve(null),
        readJsonSafe(resolveSafe("data/wishlist.json"))
      ]);

      const index = normalizeIndex(rawIndex);
      const now = new Date().toISOString();
      const mainIngredients = normalizeIngredientList(input.mainIngredients);
      const seasonings = normalizeIngredientList(input.seasonings);
      const steps = normalizeSteps(input.steps);
      const tags = normalizeTagNames(input.tags);
      const tips = String(input.tips || "").trim();

      let imagePath = existingRecipe ? existingRecipe.imagePath || null : null;
      if (input.imageBase64) {
        const ext = input.imageExt === "png" ? "png" : input.imageExt === "webp" ? "webp" : "jpg";
        const newImagePath = `data/images/${recipeId}_${Date.now().toString(36)}.${ext}`;
        if (imagePath && imagePath !== newImagePath) {
          await unlinkSafe(resolveSafe(imagePath));
        }
        imagePath = newImagePath;
        const imgTarget = resolveSafe(newImagePath);
        await ensureDir(path.dirname(imgTarget));
        await fs.writeFile(imgTarget, Buffer.from(input.imageBase64, "base64"));
      } else if (input.removeImage && imagePath) {
        await unlinkSafe(resolveSafe(imagePath));
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

      await Promise.all([
        writeJson(resolveSafe(`data/recipes/${recipeId}.json`), recipe),
        writeJson(resolveSafe("data/index.json"), index)
      ]);

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
        await writeJson(resolveSafe("data/wishlist.json"), wishlist);
      }

      return { recipe, index, wishlist: wishlistChanged ? wishlist : null };
      });
    },

    deleteRecipe(recipeId) {
      return withWriteLock(async () => {
      const [rawIndex, existingRecipe, rawWishlist] = await Promise.all([
        readJsonSafe(resolveSafe("data/index.json")),
        readJsonSafe(resolveSafe(`data/recipes/${recipeId}.json`)),
        readJsonSafe(resolveSafe("data/wishlist.json"))
      ]);
      const index = normalizeIndex(rawIndex);
      const now = new Date().toISOString();
      index.recipes = index.recipes.filter((r) => r.id !== recipeId);
      index.updatedAt = now;

      await Promise.all([
        writeJson(resolveSafe("data/index.json"), index),
        unlinkSafe(resolveSafe(`data/recipes/${recipeId}.json`)),
        existingRecipe?.imagePath
          ? unlinkSafe(resolveSafe(existingRecipe.imagePath))
          : Promise.resolve()
      ]);

      const wishlist = normalizeWishlist(rawWishlist);
      const prevLen = wishlist.items.length;
      wishlist.items = wishlist.items.filter((i) => i.recipeId !== recipeId);
      if (wishlist.items.length !== prevLen) {
        wishlist.updatedAt = now;
        await writeJson(resolveSafe("data/wishlist.json"), wishlist);
      }
      return { index, wishlist };
      });
    },

    updateTags(nextTags, renameMap = {}) {
      return withWriteLock(async () => {
      const rawIndex = await readJsonSafe(resolveSafe("data/index.json"));
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
      const validTagSet = new Set(cleanTags.map((t) => t.name));

      for (const summary of index.recipes) {
        const updated = normalizeTagNames(
          (summary.tags || []).map((name) =>
            renameMap[name] !== undefined ? renameMap[name] : name
          )
        ).filter((name) => validTagSet.has(name));
        if (JSON.stringify(updated) !== JSON.stringify(summary.tags || [])) {
          summary.tags = updated;
          const rec = await readJsonSafe(resolveSafe(`data/recipes/${summary.id}.json`));
          if (rec) {
            rec.tags = updated;
            rec.updatedAt = now;
            await writeJson(resolveSafe(`data/recipes/${summary.id}.json`), rec);
          }
        }
      }
      index.updatedAt = now;
      await writeJson(resolveSafe("data/index.json"), index);
      return { index };
      });
    },

    mutateWishlist(mutatorFn) {
      return withWriteLock(async () => {
      const [rawIndex, rawWishlist] = await Promise.all([
        readJsonSafe(resolveSafe("data/index.json")),
        readJsonSafe(resolveSafe("data/wishlist.json"))
      ]);
      const index = normalizeIndex(rawIndex);
      const wishlist = normalizeWishlist(rawWishlist);
      const now = new Date().toISOString();
      const extra = await mutatorFn({ index, wishlist, now });
      wishlist.updatedAt = now;
      await writeJson(resolveSafe("data/wishlist.json"), wishlist);

      let indexChanged = false;
      if (extra?.cookedRecipeId) {
        const cookedId = extra.cookedRecipeId;
        const rec = await readJsonSafe(resolveSafe(`data/recipes/${cookedId}.json`));
        if (rec) {
          rec.cookCount = (rec.cookCount || 0) + 1;
          rec.lastCookedAt = now;
          rec.updatedAt = now;
          await writeJson(resolveSafe(`data/recipes/${cookedId}.json`), rec);
        }
        const summary = index.recipes.find((r) => r.id === cookedId);
        if (summary) {
          summary.cookCount = (summary.cookCount || 0) + 1;
          summary.updatedAt = now;
          index.updatedAt = now;
          indexChanged = true;
          await writeJson(resolveSafe("data/index.json"), index);
        }
      }
      return { wishlist, index: indexChanged ? index : null };
      });
    },

    seedStarterRecipes() {
      return withWriteLock(async () => {
      const rawIndex = await readJsonSafe(resolveSafe("data/index.json"));
      const index = normalizeIndex(rawIndex);
      const existingIds = new Set(index.recipes.map((r) => r.id));
      const seeds = getSeedRecipes();
      let addedCount = 0;
      for (const seed of seeds) {
        if (existingIds.has(seed.id)) continue;
        mergeTagsIntoIndex(index, seed.tags);
        index.recipes.push(buildRecipeSummary(seed));
        await writeJson(resolveSafe(`data/recipes/${seed.id}.json`), seed);
        addedCount += 1;
      }
      if (addedCount > 0) {
        index.updatedAt = new Date().toISOString();
        await writeJson(resolveSafe("data/index.json"), index);
      }
      return { index, addedCount };
      });
    },

    async readImage(imagePath) {
      try {
        const buf = await fs.readFile(resolveSafe(imagePath));
        const ext = imagePath.split(".").pop()?.toLowerCase();
        const contentType =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : "image/jpeg";
        return { bytes: buf, contentType };
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    }
  };
}
