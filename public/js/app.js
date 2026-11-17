import {
  api,
  buildImageUrl,
  compressImageFile,
  formatBytes,
  loadOfflineSnapshot,
  saveOfflineSnapshot
} from "./api.js";
import { getAmeibaoSvg, nextAmeibaoQuote, renderAmeibao } from "./ameibao.js";
import {
  mergePantryIngredients,
  parseBatchIngredients,
  parseBatchSteps
} from "./parser.js";

const CHEF_PREF_STORAGE = "ameibao_chef_pref_v1";

const state = {
  authenticated: false,
  mode: "github",
  configured: true,
  missingEnv: [],
  chefMode: loadChefMode(),
  viewMode: "grid",
  mobileTab: "catalog",
  index: { tags: [], recipes: [] },
  wishlist: {
    items: [],
    checkedIngredients: {},
    customItems: [],
    feedCount: 0,
    history: []
  },
  recipeCache: new Map(),
  search: "",
  selectedTags: new Set(),
  tagLogic: "and",
  specialFilter: "all",
  editingNoteRecipeId: null,
  detailStepDone: new Set(),
  currentDetailId: null,
  editor: {
    id: null,
    tags: new Set(),
    imageBase64: null,
    imageExt: "jpg",
    existingImagePath: null,
    removeImage: false,
    mainIngredients: [],
    seasonings: [],
    steps: []
  },
  tagManagerDraft: []
};

let celebrationTimer = null;

function loadChefMode() {
  try {
    return localStorage.getItem(CHEF_PREF_STORAGE) === "1";
  } catch {
    return false;
  }
}

function saveChefMode(val) {
  try {
    localStorage.setItem(CHEF_PREF_STORAGE, val ? "1" : "0");
  } catch {
    // ignore
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast-item";
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 2800);
}

function showCelebration(mood, title, sub) {
  const overlay = document.getElementById("ameibao-celebration");
  const sealBox = document.getElementById("celebration-ameibao");
  const titleEl = document.getElementById("celebration-title");
  const subEl = document.getElementById("celebration-sub");
  if (!overlay || !sealBox) return;

  renderAmeibao(sealBox, { mood, size: 150 });
  titleEl.textContent = title;
  subEl.textContent = sub;
  overlay.classList.remove("hidden");

  clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => {
    overlay.classList.add("hidden");
  }, 2400);
}

function setSpeechBubble(text) {
  const el = document.getElementById("header-speech-text");
  if (el) el.textContent = text;
}

function updateDefaultSpeech() {
  const total = state.index.recipes.length;
  const drafts = state.index.recipes.filter((r) => r.status === "draft").length;
  const wishCount = state.wishlist.items.length;
  if (wishCount > 0) {
    setSpeechBubble(`想吃清单里有 ${wishCount} 道菜等着主厨备料呢～`);
  } else if (total === 0) {
    setSpeechBubble("小厨房刚刚开张，快来记下第一道拿手菜吧！");
  } else if (drafts > 0 && state.chefMode) {
    setSpeechBubble(`阿咩豹守着 ${total} 道菜啦，还有 ${drafts} 道待补全哦～`);
  } else {
    setSpeechBubble(`阿咩豹正守着你们的 ${total} 道私房菜呢～`);
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("hidden");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("hidden");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // ignore SW registration failure in unsupported contexts
    });
  }
}

function renderLockScreen() {
  document.getElementById("lock-screen").classList.remove("hidden");
  document.getElementById("app-shell").classList.add("hidden");
  renderAmeibao(document.getElementById("lock-ameibao"), { mood: "stand", size: 132 });

  const envWarning = document.getElementById("env-warning");
  if (!state.configured) {
    envWarning.classList.remove("hidden");
    envWarning.innerHTML = `
      <strong>后台尚未完成配置：</strong>还缺少环境变量 <code>${escapeHtml(
        state.missingEnv.join(", ")
      )}</code>。<br/>
      请先按 <code>DEPLOY_GUIDE.md</code> 在 Cloudflare Pages 后台填写环境变量并重新部署。
    `;
  } else {
    envWarning.classList.add("hidden");
  }
}

function renderAppShell() {
  document.getElementById("lock-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  renderAmeibao(document.getElementById("header-ameibao"), { mood: "peek", size: 96 });
  applyChefModeUi();
  renderAll();
}

function applyChefModeUi() {
  const btn = document.getElementById("chef-mode-btn");
  const label = document.getElementById("chef-mode-label");
  btn.classList.toggle("chef-active", state.chefMode);
  btn.setAttribute("aria-pressed", state.chefMode ? "true" : "false");
  label.textContent = state.chefMode ? "主厨模式" : "逛菜单";

  document.querySelectorAll(".chef-only").forEach((el) => {
    if (el.id === "chef-fab-btn") {
      el.classList.toggle("hidden", !state.chefMode || state.mobileTab !== "catalog");
    } else {
      el.classList.toggle("hidden", !state.chefMode);
    }
  });
}

function getTagMeta(tagName) {
  return (
    (state.index.tags || []).find((t) => t.name === tagName) || {
      name: tagName,
      emoji: "🏷️",
      color: "sky"
    }
  );
}

function getFilteredRecipes() {
  const q = state.search.trim().toLowerCase();
  const selected = Array.from(state.selectedTags);

  let list = state.index.recipes.filter((rec) => {
    if (state.specialFilter === "draft" && rec.status !== "draft") {
      return false;
    }
    if (selected.length > 0) {
      const recTags = new Set(rec.tags || []);
      if (state.tagLogic === "and") {
        if (!selected.every((t) => recTags.has(t))) return false;
      } else {
        if (!selected.some((t) => recTags.has(t))) return false;
      }
    }
    if (q) {
      const titleHit = (rec.title || "").toLowerCase().includes(q);
      const tagHit = (rec.tags || []).some((t) => t.toLowerCase().includes(q));
      const mainHit = (rec.mainIngredients || []).some((m) => m.toLowerCase().includes(q));
      const seaHit = (rec.seasonings || []).some((s) => s.toLowerCase().includes(q));
      const noteHit = (rec.notePreview || "").toLowerCase().includes(q);
      if (!titleHit && !tagHit && !mainHit && !seaHit && !noteHit) return false;
    }
    return true;
  });

  if (state.specialFilter === "popular") {
    list = [...list].sort((a, b) => (b.cookCount || 0) - (a.cookCount || 0));
  }
  return list;
}

function findQueryIngredientMatch(rec, query) {
  const q = query.trim().toLowerCase();
  if (!q) return "";
  if ((rec.title || "").toLowerCase().includes(q)) return "";
  const mainMatch = (rec.mainIngredients || []).find((m) => m.toLowerCase().includes(q));
  if (mainMatch) return `主料含：${mainMatch}`;
  const seaMatch = (rec.seasonings || []).find((s) => s.toLowerCase().includes(q));
  if (seaMatch) return `调料含：${seaMatch}`;
  return "";
}

function renderFilterChips() {
  const container = document.getElementById("tag-filter-list");
  const recipes = state.index.recipes || [];
  const tagCounts = new Map();
  let draftCount = 0;

  for (const r of recipes) {
    if (r.status === "draft") draftCount += 1;
    for (const t of r.tags || []) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }

  const chips = [];
  const isAll = state.selectedTags.size === 0 && state.specialFilter === "all";
  chips.push(
    `<button type="button" class="tag-chip ${isAll ? "active" : ""}" data-filter-all="1">全部 <span class="tag-chip-count">${recipes.length}</span></button>`
  );

  if (draftCount > 0 || state.chefMode) {
    chips.push(
      `<button type="button" class="tag-chip draft-chip ${
        state.specialFilter === "draft" ? "active" : ""
      }" data-special-filter="draft">📝 待补全 <span class="tag-chip-count">${draftCount}</span></button>`
    );
  }

  chips.push(
    `<button type="button" class="tag-chip ${
      state.specialFilter === "popular" ? "active" : ""
    }" data-special-filter="popular">🔥 常做排行</button>`
  );

  for (const tag of state.index.tags || []) {
    const count = tagCounts.get(tag.name) || 0;
    const active = state.selectedTags.has(tag.name);
    chips.push(
      `<button type="button" class="tag-chip ${active ? "active" : ""}" data-tag-filter="${escapeHtml(
        tag.name
      )}">${escapeHtml(tag.emoji || "🏷️")} ${escapeHtml(
        tag.name
      )} <span class="tag-chip-count">${count}</span></button>`
    );
  }

  container.innerHTML = chips.join("");

  const logicBtn = document.getElementById("tag-logic-btn");
  logicBtn.classList.toggle("hidden", state.selectedTags.size < 2);
  logicBtn.textContent =
    state.tagLogic === "and" ? "同时包含所选标签" : "包含任一所选标签";

  const hasFilters =
    Boolean(state.search.trim()) ||
    state.selectedTags.size > 0 ||
    state.specialFilter !== "all";
  document.getElementById("clear-filters-btn").classList.toggle("hidden", !hasFilters);
}

function renderRecipeGrid() {
  const container = document.getElementById("recipe-list-container");
  container.classList.toggle("list-mode", state.viewMode === "list");
  const filtered = getFilteredRecipes();
  document.getElementById("recipe-count-label").textContent = `显示 ${filtered.length} / ${state.index.recipes.length} 道菜`;

  if (state.index.recipes.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <div>${getAmeibaoSvg({ mood: "empty", size: 120 })}</div>
        <h3>小厨房还没有录入菜谱呢</h3>
        <p class="muted-text">可以先让阿咩豹摆上 3 道示例菜试试手感和想吃清单，或者直接开始记第一道菜！</p>
        <div class="empty-state-actions">
          <button type="button" class="btn btn-ice" id="empty-seed-btn">✨ 放入 3 道示例菜</button>
          <button type="button" class="btn btn-primary" id="empty-add-btn">🍳 记第一道菜</button>
        </div>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <div>${getAmeibaoSvg({ mood: "empty", size: 112 })}</div>
        <h3>阿咩豹翻遍小本本也没找到匹配的菜</h3>
        <p class="muted-text">换个食材关键词试试，或者重置筛选看看全部菜谱～</p>
        <div class="empty-state-actions">
          <button type="button" class="btn btn-ice" id="empty-reset-btn">查看全部菜谱</button>
        </div>
      </div>
    `;
    return;
  }

  const wishlistSet = new Set((state.wishlist.items || []).map((i) => i.recipeId));
  const sealPlaceholder = getAmeibaoSvg({ mood: "stand", size: 64 });

  container.innerHTML = filtered
    .map((rec) => {
      const inWish = wishlistSet.has(rec.id);
      const imgHtml = rec.imagePath
        ? `<img src="${escapeHtml(buildImageUrl(rec.imagePath))}" alt="${escapeHtml(
            rec.title
          )}" loading="lazy" />`
        : `<div class="recipe-cover-fallback">${sealPlaceholder}<span class="recipe-cover-fallback-label">待拍成品照</span></div>`;

      const tagHtml = (rec.tags || [])
        .slice(0, 3)
        .map((tagName) => {
          const meta = getTagMeta(tagName);
          return `<span class="mini-tag color-${escapeHtml(meta.color || "sky")}">${escapeHtml(
            meta.emoji || ""
          )} ${escapeHtml(tagName)}</span>`;
        })
        .join("");
      const extraTags =
        (rec.tags || []).length > 3
          ? `<span class="mini-tag">+${rec.tags.length - 3}</span>`
          : "";

      const ingPreview = (rec.mainIngredients || []).slice(0, 4).join(" · ");
      const matchHint = findQueryIngredientMatch(rec, state.search);

      return `
        <article class="recipe-card" data-open-recipe="${escapeHtml(rec.id)}">
          <div class="recipe-card-media">
            ${imgHtml}
            ${rec.status === "draft" ? '<span class="card-badge-draft">📝 待补全</span>' : ""}
            <button
              type="button"
              class="card-wish-btn ${inWish ? "in-wishlist" : ""}"
              data-toggle-wish="${escapeHtml(rec.id)}"
              aria-label="${inWish ? "已在想吃清单" : "加入想吃清单"}"
            >
              ${inWish ? "♥ 想吃" : "♡ 想吃"}
            </button>
            ${
              state.chefMode
                ? `<button type="button" class="card-edit-btn" data-edit-recipe="${escapeHtml(
                    rec.id
                  )}" title="编辑菜谱" aria-label="编辑菜谱">✏️</button>`
                : ""
            }
          </div>
          <div class="recipe-card-body">
            <h3 class="recipe-card-title">${escapeHtml(rec.title)}</h3>
            <div class="recipe-card-tags">${tagHtml}${extraTags}</div>
            ${matchHint ? `<span class="match-hint-pill">${escapeHtml(matchHint)}</span>` : ""}
            <p class="recipe-card-ings">${
              ingPreview ? escapeHtml(ingPreview) : "点击查看或补全材料"
            }</p>
          </div>
        </article>
      `;
    })
    .join("");
}

async function ensureWishlistRecipesLoaded() {
  const items = state.wishlist.items || [];
  const missing = items
    .map((i) => i.recipeId)
    .filter((id) => !state.recipeCache.has(id));
  if (missing.length === 0) return;

  await Promise.all(
    missing.map(async (id) => {
      try {
        const res = await api.getRecipe(id);
        if (res?.recipe) state.recipeCache.set(id, res.recipe);
      } catch {
        // ignore missing deleted recipe
      }
    })
  );
  renderWishlistPane();
}

function renderWishlistPane() {
  const items = state.wishlist.items || [];
  const feedBadgeText = document.getElementById("feed-badge-text");
  if (feedBadgeText) {
    feedBadgeText.textContent = `已投喂 ${state.wishlist.feedCount || 0} 次`;
  }

  document.getElementById("wishlist-count-pill").textContent = `${items.length} 道`;
  const mobileBadge = document.getElementById("mobile-wishlist-badge");
  mobileBadge.textContent = String(items.length);
  mobileBadge.classList.toggle("hidden", items.length === 0);

  const dishesEl = document.getElementById("wishlist-dishes");
  if (items.length === 0) {
    dishesEl.innerHTML = `
      <div class="muted-text" style="padding: 12px 4px; text-align: center;">
        还没有点菜哦～点一下菜单卡片右上角的 <strong>♡ 想吃</strong>，阿咩豹就会帮你记在这里并汇总买菜清单！
      </div>
    `;
  } else {
    dishesEl.innerHTML = items
      .map((item) => {
        const thumb = item.imagePath
          ? `<img src="${escapeHtml(buildImageUrl(item.imagePath))}" alt="${escapeHtml(
              item.title
            )}" />`
          : getAmeibaoSvg({ mood: "stand", size: 42 });

        const isEditingNote = state.editingNoteRecipeId === item.recipeId;
        const notePart = isEditingNote
          ? `
            <div style="display:flex;gap:4px;margin-top:4px;">
              <input type="text" class="inline-wish-note-input" data-note-input="${escapeHtml(
                item.recipeId
              )}" value="${escapeHtml(item.note || "")}" placeholder="写备注，如周末做/少辣" style="flex:1;min-width:0;padding:4px 8px;border-radius:8px;border:1px solid var(--border-warm);font-size:13px;" />
              <button type="button" class="mini-pill-btn active" data-save-note="${escapeHtml(
                item.recipeId
              )}">存</button>
            </div>
          `
          : `
            <button type="button" class="wishlist-dish-note-btn" data-edit-note="${escapeHtml(
              item.recipeId
            )}">
              ${item.note ? `💬 ${escapeHtml(item.note)}` : "+ 加一句备注（如：周末吃/少辣）"}
            </button>
          `;

        return `
          <div class="wishlist-dish-row">
            <div class="wishlist-dish-thumb" data-open-recipe="${escapeHtml(item.recipeId)}">
              ${thumb}
            </div>
            <div class="wishlist-dish-info">
              <div class="wishlist-dish-name" data-open-recipe="${escapeHtml(
                item.recipeId
              )}">${escapeHtml(item.title)}</div>
              ${notePart}
            </div>
            <div class="wishlist-dish-actions">
              <button type="button" class="btn btn-ice btn-sm" data-cook-dish="${escapeHtml(
                item.recipeId
              )}">做好了 ✓</button>
              <button type="button" class="mini-link-btn danger" data-remove-wish="${escapeHtml(
                item.recipeId
              )}">移出</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const merged = mergePantryIngredients(items, state.recipeCache);
  const checkedMap = state.wishlist.checkedIngredients || {};
  const customItems = state.wishlist.customItems || [];
  const pantryEl = document.getElementById("pantry-merged-list");
  const hasAnyChecked =
    Object.keys(checkedMap).length > 0 || customItems.some((c) => c.checked);
  document
    .getElementById("clear-checked-pantry-btn")
    .classList.toggle("hidden", !hasAnyChecked);

  if (
    merged.mainGroups.length === 0 &&
    merged.seasoningGroups.length === 0 &&
    customItems.length === 0
  ) {
    pantryEl.innerHTML =
      items.length > 0 && merged.missingRecipeIds.length > 0
        ? '<p class="muted-text">阿咩豹正在把材料抄到小本本上…</p>'
        : '<p class="muted-text">点好菜后，主料和调料会自动汇总到这里方便去超市核对。</p>';
    return;
  }

  const renderGroup = (title, groups) => {
    if (groups.length === 0) return "";
    return `
      <div class="pantry-group-title">${title}</div>
      ${groups
        .map((g) => {
          const checked = Boolean(checkedMap[g.key]);
          return `
            <div class="pantry-item-row ${checked ? "checked" : ""}" data-toggle-pantry="${escapeHtml(
              g.key
            )}">
              <span class="pantry-checkbox">${checked ? "✓" : ""}</span>
              <div class="pantry-item-text">
                <div class="pantry-item-top">
                  <span class="pantry-item-name">${escapeHtml(g.name)}</span>
                  <span class="pantry-item-amount">${escapeHtml(g.totalText)}</span>
                </div>
                <div class="pantry-item-sources">${escapeHtml(g.detailText)}</div>
              </div>
            </div>
          `;
        })
        .join("")}
    `;
  };

  const customHtml =
    customItems.length > 0
      ? `
        <div class="pantry-group-title">📝 临时顺便买</div>
        ${customItems
          .map(
            (c) => `
              <div class="pantry-item-row ${c.checked ? "checked" : ""}" data-toggle-custom="${escapeHtml(
                c.id
              )}">
                <span class="pantry-checkbox">${c.checked ? "✓" : ""}</span>
                <div class="pantry-item-text">
                  <div class="pantry-item-top">
                    <span class="pantry-item-name">${escapeHtml(c.text)}</span>
                    <button type="button" class="mini-link-btn danger" data-remove-custom="${escapeHtml(
                      c.id
                    )}">删</button>
                  </div>
                </div>
              </div>
            `
          )
          .join("")}
      `
      : "";

  pantryEl.innerHTML =
    renderGroup("🥩 主料采买", merged.mainGroups) +
    renderGroup("🧂 调料核对", merged.seasoningGroups) +
    customHtml;
}

function renderAll() {
  renderFilterChips();
  renderRecipeGrid();
  renderWishlistPane();
  updateDefaultSpeech();
}

async function openRecipeDetail(recipeId) {
  state.currentDetailId = recipeId;
  state.detailStepDone.clear();
  const container = document.getElementById("recipe-detail-content");
  container.innerHTML = `<div style="text-align:center;padding:30px;">${getAmeibaoSvg({
    mood: "cooking",
    size: 96
  })}<p class="muted-text">阿咩豹正在翻开菜谱…</p></div>`;
  openModal("recipe-detail-modal");

  let recipe = state.recipeCache.get(recipeId);
  if (!recipe) {
    try {
      const res = await api.getRecipe(recipeId);
      recipe = res.recipe;
      if (recipe) state.recipeCache.set(recipeId, recipe);
    } catch (err) {
      container.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
      return;
    }
  }
  renderRecipeDetailContent(recipe);
}

function renderRecipeDetailContent(recipe) {
  if (!recipe) return;
  const container = document.getElementById("recipe-detail-content");
  const inWish = (state.wishlist.items || []).some((i) => i.recipeId === recipe.id);

  const heroHtml = recipe.imagePath
    ? `<div class="detail-hero"><img src="${escapeHtml(
        buildImageUrl(recipe.imagePath)
      )}" alt="${escapeHtml(recipe.title)}" /></div>`
    : "";

  const tagsHtml = (recipe.tags || [])
    .map((t) => {
      const meta = getTagMeta(t);
      return `<span class="mini-tag color-${escapeHtml(meta.color || "sky")}">${escapeHtml(
        meta.emoji || ""
      )} ${escapeHtml(t)}</span>`;
    })
    .join("");

  const renderIngList = (items) => {
    if (!items || items.length === 0) {
      return '<p class="muted-text">还没填哦，开启主厨模式随时补充～</p>';
    }
    return `<div class="ing-pill-list">${items
      .map(
        (ing) => `
          <div class="ing-row-item">
            <button type="button" class="ing-search-link" data-search-ing="${escapeHtml(
              ing.name
            )}" title="搜搜还有哪些菜用到它">${escapeHtml(ing.name)}</button>
            <span class="ing-amount-tag">${escapeHtml(ing.amount || "适量")}</span>
          </div>
        `
      )
      .join("")}</div>`;
  };

  const stepsHtml =
    recipe.steps && recipe.steps.length > 0
      ? `<ol class="steps-list">${recipe.steps
          .map(
            (step, idx) => `
              <li class="step-item ${state.detailStepDone.has(idx) ? "done" : ""}" data-toggle-step="${idx}">
                <span class="step-num">${idx + 1}</span>
                <span>${escapeHtml(step)}</span>
              </li>
            `
          )
          .join("")}</ol>`
      : '<p class="muted-text">还没记录具体做法步骤。</p>';

  container.innerHTML = `
    ${heroHtml}
    <h2 class="detail-title">${escapeHtml(recipe.title)}</h2>
    <div class="recipe-card-tags" style="margin-bottom:8px;">
      ${tagsHtml}
      ${recipe.status === "draft" ? '<span class="mini-tag color-gold">📝 待补全</span>' : ""}
      ${
        recipe.cookCount > 0
          ? `<span class="mini-tag color-sage">🍳 做过 ${recipe.cookCount} 次</span>`
          : ""
      }
    </div>

    <div class="detail-actions-bar">
      <button type="button" class="btn ${inWish ? "btn-danger-soft" : "btn-primary"}" data-detail-wish="${escapeHtml(
        recipe.id
      )}">
        ${inWish ? "♥ 已在想吃清单（点击移出）" : "💛 加入想吃清单"}
      </button>
      ${
        state.chefMode
          ? `
            <button type="button" class="btn btn-ice" data-detail-edit="${escapeHtml(
              recipe.id
            )}">✏️ 编辑菜谱</button>
            <button type="button" class="btn btn-danger-soft" data-detail-delete="${escapeHtml(
              recipe.id
            )}">🗑️ 删除</button>
          `
          : ""
      }
    </div>

    <div class="detail-ingredients-grid">
      <div class="detail-box">
        <h3>🥩 主料</h3>
        ${renderIngList(recipe.mainIngredients)}
      </div>
      <div class="detail-box seasoning-box">
        <h3>🧂 调料与香料</h3>
        ${renderIngList(recipe.seasonings)}
      </div>
    </div>

    <div class="field-group">
      <div class="field-label-row">
        <span class="field-label">👩‍🍳 做法步骤</span>
        <span class="muted-text">做菜时点击每一步可划掉标记</span>
      </div>
      ${stepsHtml}
    </div>

    ${
      recipe.tips
        ? `<div class="tips-callout"><strong>💡 主厨小贴士：</strong>${escapeHtml(
            recipe.tips
          )}</div>`
        : ""
    }
  `;
}

function resetEditorState(recipe = null) {
  state.editor = {
    id: recipe?.id || null,
    tags: new Set(recipe?.tags || []),
    imageBase64: null,
    imageExt: "jpg",
    existingImagePath: recipe?.imagePath || null,
    removeImage: false,
    mainIngredients:
      recipe?.mainIngredients?.length > 0
        ? recipe.mainIngredients.map((i) => ({ ...i }))
        : [{ name: "", amount: "" }],
    seasonings:
      recipe?.seasonings?.length > 0
        ? recipe.seasonings.map((i) => ({ ...i }))
        : [{ name: "", amount: "" }],
    steps: recipe?.steps?.length > 0 ? [...recipe.steps] : [""]
  };

  document.getElementById("editor-modal-title").textContent = recipe
    ? `✏️ 编辑：${recipe.title}`
    : "🍳 记一道拿手菜";
  document.getElementById("editor-title").value = recipe?.title || "";
  document.getElementById("editor-draft-checkbox").checked = recipe?.status === "draft";
  document.getElementById("editor-tips").value = recipe?.tips || "";
  document.getElementById("recipe-photo-input").value = "";
  document.getElementById("photo-size-info").textContent = "";
  document.getElementById("batch-main-box").classList.add("hidden");
  document.getElementById("batch-seasoning-box").classList.add("hidden");
  document.getElementById("batch-steps-box").classList.add("hidden");

  renderEditorPhotoPreview();
  renderEditorTagsPicker();
  renderEditorIngredients("main");
  renderEditorIngredients("seasoning");
  renderEditorSteps();
}

async function openEditorForRecipe(recipeId = null) {
  if (!recipeId) {
    resetEditorState(null);
    openModal("recipe-editor-modal");
    return;
  }
  let recipe = state.recipeCache.get(recipeId);
  if (!recipe) {
    try {
      const res = await api.getRecipe(recipeId);
      recipe = res.recipe;
      if (recipe) state.recipeCache.set(recipeId, recipe);
    } catch (err) {
      showToast(err.message);
      return;
    }
  }
  resetEditorState(recipe);
  openModal("recipe-editor-modal");
}

function renderEditorPhotoPreview(dataUrl = null) {
  const area = document.getElementById("photo-preview-area");
  const removeBtn = document.getElementById("remove-photo-btn");
  const src =
    dataUrl ||
    (!state.editor.removeImage && state.editor.existingImagePath
      ? buildImageUrl(state.editor.existingImagePath)
      : "");

  if (src) {
    area.innerHTML = `<img src="${escapeHtml(src)}" alt="成品图预览" />`;
    removeBtn.classList.remove("hidden");
  } else {
    area.innerHTML = `
      <div class="photo-placeholder-inner">
        <span class="photo-icon">📷</span>
        <span>点击从相册选成品图（自动压缩，不怕占空间）</span>
      </div>
    `;
    removeBtn.classList.add("hidden");
  }
}

function renderEditorTagsPicker() {
  const container = document.getElementById("editor-tags-picker");
  const knownNames = new Set((state.index.tags || []).map((t) => t.name));
  const allTags = [...(state.index.tags || [])];
  for (const selected of state.editor.tags) {
    if (!knownNames.has(selected)) {
      allTags.push({ name: selected, emoji: "🏷️", color: "sky" });
    }
  }
  container.innerHTML = allTags
    .map((t) => {
      const active = state.editor.tags.has(t.name);
      return `<button type="button" class="tag-chip ${active ? "active" : ""}" data-editor-tag="${escapeHtml(
        t.name
      )}">${escapeHtml(t.emoji || "🏷️")} ${escapeHtml(t.name)}</button>`;
    })
    .join("");
}

function renderEditorIngredients(kind) {
  const list =
    kind === "main" ? state.editor.mainIngredients : state.editor.seasonings;
  const el = document.getElementById(
    kind === "main" ? "editor-main-list" : "editor-seasoning-list"
  );
  el.innerHTML = list
    .map(
      (item, idx) => `
        <div class="ing-input-row">
          <input
            type="text"
            value="${escapeHtml(item.name)}"
            placeholder="${kind === "main" ? "主料名称（如 牛腱子）" : "调料名称（如 生抽）"}"
            data-ing-kind="${kind}"
            data-ing-idx="${idx}"
            data-ing-field="name"
          />
          <input
            type="text"
            value="${escapeHtml(item.amount)}"
            placeholder="用量（如 500g）"
            data-ing-kind="${kind}"
            data-ing-idx="${idx}"
            data-ing-field="amount"
          />
          <button type="button" class="row-remove-btn" data-remove-ing="${kind}" data-idx="${idx}" aria-label="删除行">✕</button>
        </div>
      `
    )
    .join("");
}

function renderEditorSteps() {
  const el = document.getElementById("editor-steps-list");
  el.innerHTML = state.editor.steps
    .map(
      (step, idx) => `
        <div class="step-input-row">
          <span class="step-num">${idx + 1}</span>
          <textarea
            rows="2"
            placeholder="写下第 ${idx + 1} 步做法…"
            data-step-idx="${idx}"
          >${escapeHtml(step)}</textarea>
          <button type="button" class="row-remove-btn" data-remove-step="${idx}" aria-label="删除步骤">✕</button>
        </div>
      `
    )
    .join("");
}

async function saveEditorRecipe(continueNext = false) {
  const title = document.getElementById("editor-title").value.trim();
  if (!title) {
    showToast("请先填上菜名哦～");
    document.getElementById("editor-title").focus();
    return;
  }
  const isDraft = document.getElementById("editor-draft-checkbox").checked;
  const tips = document.getElementById("editor-tips").value.trim();
  const mainIngredients = state.editor.mainIngredients.filter((i) => i.name.trim());
  const seasonings = state.editor.seasonings.filter((i) => i.name.trim());
  const steps = state.editor.steps.map((s) => s.trim()).filter(Boolean);
  const hasContent =
    mainIngredients.length > 0 || seasonings.length > 0 || steps.length > 0;

  const payload = {
    title,
    tags: Array.from(state.editor.tags),
    mainIngredients,
    seasonings,
    steps,
    tips,
    status: isDraft ? "draft" : hasContent ? "complete" : "draft",
    imageBase64: state.editor.imageBase64,
    imageExt: state.editor.imageExt,
    removeImage: state.editor.removeImage
  };

  const saveBtn = document.getElementById("save-recipe-btn");
  const nextBtn = document.getElementById("save-and-next-btn");
  saveBtn.disabled = true;
  nextBtn.disabled = true;
  saveBtn.textContent = "阿咩豹保存中…";

  try {
    const res = state.editor.id
      ? await api.updateRecipe(state.editor.id, payload)
      : await api.createRecipe(payload);
    if (res.recipe) state.recipeCache.set(res.recipe.id, res.recipe);
    if (res.index) state.index = res.index;
    if (res.wishlist) state.wishlist = res.wishlist;
    persistLocalSnapshot();
    renderAll();

    if (continueNext) {
      resetEditorState(null);
      showToast(`已保存「${title}」，继续记下一道吧！`);
      document.getElementById("editor-title").focus();
    } else {
      closeModal("recipe-editor-modal");
      showToast(`已保存到私有小库：${title}`);
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    saveBtn.disabled = false;
    nextBtn.disabled = false;
    saveBtn.textContent = "保存菜谱";
  }
}

function renderSettingsModal() {
  const toggleBtn = document.getElementById("settings-chef-toggle");
  toggleBtn.textContent = state.chefMode ? "已开启主厨模式（点此关闭）" : "开启主厨模式";
  toggleBtn.className = state.chefMode ? "btn btn-warm btn-sm" : "btn btn-ice btn-sm";

  document.getElementById("sync-mode-label").textContent =
    state.mode === "github"
      ? "当前已连接 GitHub 私有仓库（密码仅在云端验证）"
      : "当前运行在本地体验模式（数据保存在本地 .local-db）";

  state.tagManagerDraft = (state.index.tags || []).map((t) => ({
    ...t,
    origName: t.name
  }));
  renderTagManagerList();

  const history = state.wishlist.history || [];
  const historyCard = document.getElementById("recent-cooked-card");
  const historyList = document.getElementById("recent-cooked-list");
  if (history.length > 0) {
    historyCard.classList.remove("hidden");
    historyList.innerHTML = history
      .slice(0, 8)
      .map((h) => {
        const dateStr = h.cookedAt ? h.cookedAt.slice(0, 10) : "";
        return `<li>${escapeHtml(h.title)} <span class="muted-text">(${escapeHtml(
          dateStr
        )})</span></li>`;
      })
      .join("");
  } else {
    historyCard.classList.add("hidden");
  }
}

function renderTagManagerList() {
  const el = document.getElementById("tag-manager-list");
  el.innerHTML = state.tagManagerDraft
    .map(
      (t, idx) => `
        <div class="tag-manager-row">
          <input type="text" class="emoji-input" maxlength="4" value="${escapeHtml(
            t.emoji || "🏷️"
          )}" data-tag-edit-idx="${idx}" data-tag-field="emoji" />
          <input type="text" maxlength="20" value="${escapeHtml(
            t.name
          )}" data-tag-edit-idx="${idx}" data-tag-field="name" style="padding:7px 10px;border-radius:10px;border:1.5px solid var(--border-warm);background:var(--card-surface);" />
          <div style="display:flex;gap:4px;">
            <button type="button" class="mini-pill-btn active" data-save-tag-row="${idx}">保存</button>
            <button type="button" class="row-remove-btn" data-delete-tag-row="${idx}" aria-label="删除标签">✕</button>
          </div>
        </div>
      `
    )
    .join("");
}

async function commitTagManagerChanges(renameMap = {}) {
  try {
    const clean = state.tagManagerDraft.map(({ name, emoji, color }) => ({
      name: name.trim(),
      emoji: (emoji || "🏷️").trim(),
      color: color || "sky"
    }));
    const res = await api.updateTags(clean, renameMap);
    if (res.index) state.index = res.index;
    state.recipeCache.clear();
    persistLocalSnapshot();
    renderTagManagerList();
    renderAll();
    showToast("分类标签已同步更新");
  } catch (err) {
    showToast(err.message);
  }
}

function persistLocalSnapshot() {
  saveOfflineSnapshot({
    mode: state.mode,
    index: state.index,
    wishlist: state.wishlist,
    savedAt: Date.now()
  });
}

async function toggleWishlistItem(recipeId) {
  const inWish = (state.wishlist.items || []).some((i) => i.recipeId === recipeId);
  try {
    const res = inWish
      ? await api.removeWishlist(recipeId)
      : await api.addWishlist(recipeId, "");
    if (res.wishlist) state.wishlist = res.wishlist;
    persistLocalSnapshot();
    renderAll();
    if (state.currentDetailId === recipeId) {
      const rec = state.recipeCache.get(recipeId);
      if (rec) renderRecipeDetailContent(rec);
    }
    if (!inWish) {
      await ensureWishlistRecipesLoaded();
      showCelebration(
        "bellyRoll",
        "点菜成功！",
        "阿咩豹开心得翻肚皮比心打滚啦～"
      );
    } else {
      showToast("已从想吃清单移出");
    }
  } catch (err) {
    showToast(err.message);
  }
}

async function handleCookDish(recipeId) {
  try {
    const res = await api.markCooked(recipeId);
    if (res.wishlist) state.wishlist = res.wishlist;
    if (res.index) state.index = res.index;
    state.recipeCache.delete(recipeId);
    persistLocalSnapshot();
    renderAll();
    showCelebration(
      "happyFed",
      "投喂阿咩豹成功 +1！",
      "热腾腾的一餐做好啦，今天也辛苦大厨～"
    );
  } catch (err) {
    showToast(err.message);
  }
}

async function loadInitialWorkspace() {
  const cached = loadOfflineSnapshot();
  if (cached?.index && cached?.wishlist) {
    state.index = cached.index;
    state.wishlist = cached.wishlist;
    state.mode = cached.mode || state.mode;
    renderAppShell();
  }

  try {
    const data = await api.bootstrap();
    state.index = data.index;
    state.wishlist = data.wishlist;
    state.mode = data.mode || state.mode;
    persistLocalSnapshot();
    renderAppShell();
    await ensureWishlistRecipesLoaded();
  } catch (err) {
    if (err.status === 401) {
      state.authenticated = false;
      renderLockScreen();
      return;
    }
    if (!cached) {
      showToast(err.message);
    }
  }
}

async function initApp() {
  registerServiceWorker();
  try {
    const health = await api.health();
    state.configured = Boolean(health.configured);
    state.mode = health.mode || "github";
    state.missingEnv = health.missing || [];

    const authCheck = await api.checkAuth();
    state.authenticated = Boolean(authCheck.authenticated);
  } catch {
    const cached = loadOfflineSnapshot();
    if (cached?.index) {
      state.authenticated = true;
      state.index = cached.index;
      state.wishlist = cached.wishlist;
      renderAppShell();
      showToast("当前处于离线浏览模式");
      return;
    }
  }

  if (state.authenticated) {
    await loadInitialWorkspace();
  } else {
    renderLockScreen();
  }
}

function switchMobileTab(tab) {
  if (tab === "settings") {
    renderSettingsModal();
    openModal("settings-modal");
    return;
  }
  state.mobileTab = tab;
  document
    .getElementById("catalog-pane")
    .classList.toggle("active-mobile-pane", tab === "catalog");
  document
    .getElementById("wishlist-pane")
    .classList.toggle("active-mobile-pane", tab === "wishlist");
  document.querySelectorAll(".bottom-nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  if (tab === "wishlist") {
    ensureWishlistRecipesLoaded();
  }
  applyChefModeUi();
}

function bindEvents() {
  document.getElementById("toggle-passcode-vis").addEventListener("click", () => {
    const input = document.getElementById("passcode-input");
    input.type = input.type === "password" ? "text" : "password";
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("login-error");
    const btn = document.getElementById("login-submit-btn");
    const passcode = document.getElementById("passcode-input").value;
    errEl.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "阿咩豹核对暗号中…";
    try {
      await api.login(passcode);
      state.authenticated = true;
      document.getElementById("passcode-input").value = "";
      await loadInitialWorkspace();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "解锁小厨房";
    }
  });

  document.getElementById("island-ameibao-btn").addEventListener("click", () => {
    setSpeechBubble(nextAmeibaoQuote());
  });

  const toggleChef = () => {
    state.chefMode = !state.chefMode;
    saveChefMode(state.chefMode);
    applyChefModeUi();
    renderFilterChips();
    renderRecipeGrid();
    if (state.chefMode) {
      setSpeechBubble("戴好厨师帽！现在可以新增或修改菜谱啦～");
      showToast("已开启主厨模式");
    } else {
      updateDefaultSpeech();
      showToast("已切回逛菜单模式（防误触）");
    }
  };
  document.getElementById("chef-mode-btn").addEventListener("click", toggleChef);
  document.getElementById("settings-chef-toggle").addEventListener("click", () => {
    toggleChef();
    renderSettingsModal();
  });

  document.getElementById("settings-btn").addEventListener("click", () => {
    renderSettingsModal();
    openModal("settings-modal");
  });

  document.querySelectorAll(".bottom-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchMobileTab(btn.dataset.tab));
  });

  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  searchInput.addEventListener("input", () => {
    state.search = searchInput.value;
    clearSearchBtn.classList.toggle("hidden", !state.search);
    renderRecipeGrid();
    renderFilterChips();
  });
  clearSearchBtn.addEventListener("click", () => {
    state.search = "";
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    renderRecipeGrid();
    renderFilterChips();
  });

  document.getElementById("random-pick-btn").addEventListener("click", () => {
    const list = getFilteredRecipes();
    if (list.length === 0) {
      showToast("当前筛选下没有菜可以抽哦，先重置筛选看看～");
      return;
    }
    const pick = list[Math.floor(Math.random() * list.length)];
    setSpeechBubble(`阿咩豹今天推荐吃「${pick.title}」！`);
    showToast(`🎲 阿咩豹抽中了：${pick.title}`);
    openRecipeDetail(pick.id);
  });

  document.getElementById("tag-filter-list").addEventListener("click", (e) => {
    const allBtn = e.target.closest("[data-filter-all]");
    if (allBtn) {
      state.selectedTags.clear();
      state.specialFilter = "all";
      renderAll();
      return;
    }
    const specialBtn = e.target.closest("[data-special-filter]");
    if (specialBtn) {
      const val = specialBtn.dataset.specialFilter;
      state.specialFilter = state.specialFilter === val ? "all" : val;
      renderAll();
      return;
    }
    const tagBtn = e.target.closest("[data-tag-filter]");
    if (tagBtn) {
      const tagName = tagBtn.dataset.tagFilter;
      if (state.selectedTags.has(tagName)) state.selectedTags.delete(tagName);
      else state.selectedTags.add(tagName);
      if (state.specialFilter === "draft") state.specialFilter = "all";
      renderAll();
    }
  });

  document.getElementById("tag-logic-btn").addEventListener("click", () => {
    state.tagLogic = state.tagLogic === "and" ? "or" : "and";
    renderAll();
  });

  document.getElementById("clear-filters-btn").addEventListener("click", () => {
    state.search = "";
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    state.selectedTags.clear();
    state.specialFilter = "all";
    renderAll();
  });

  document.getElementById("view-toggle-btn").addEventListener("click", (e) => {
    state.viewMode = state.viewMode === "grid" ? "list" : "grid";
    e.currentTarget.textContent = state.viewMode === "grid" ? "卡片视图" : "列表视图";
    renderRecipeGrid();
  });

  document.getElementById("add-recipe-inline-btn").addEventListener("click", () => {
    openEditorForRecipe(null);
  });
  document.getElementById("chef-fab-btn").addEventListener("click", () => {
    openEditorForRecipe(null);
  });

  document.getElementById("recipe-list-container").addEventListener("click", async (e) => {
    if (e.target.closest("#empty-seed-btn")) {
      try {
        const res = await api.seedStarters();
        if (res.index) state.index = res.index;
        persistLocalSnapshot();
        renderAll();
        showToast("阿咩豹摆上了 3 道示例菜！");
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    if (e.target.closest("#empty-add-btn")) {
      if (!state.chefMode) {
        state.chefMode = true;
        saveChefMode(true);
        applyChefModeUi();
      }
      openEditorForRecipe(null);
      return;
    }
    if (e.target.closest("#empty-reset-btn")) {
      state.search = "";
      searchInput.value = "";
      clearSearchBtn.classList.add("hidden");
      state.selectedTags.clear();
      state.specialFilter = "all";
      renderAll();
      return;
    }

    const wishBtn = e.target.closest("[data-toggle-wish]");
    if (wishBtn) {
      e.stopPropagation();
      await toggleWishlistItem(wishBtn.dataset.toggleWish);
      return;
    }
    const editBtn = e.target.closest("[data-edit-recipe]");
    if (editBtn) {
      e.stopPropagation();
      openEditorForRecipe(editBtn.dataset.editRecipe);
      return;
    }
    const card = e.target.closest("[data-open-recipe]");
    if (card) {
      openRecipeDetail(card.dataset.openRecipe);
    }
  });

  document.getElementById("wishlist-pane").addEventListener("click", async (e) => {
    const openTarget = e.target.closest("[data-open-recipe]");
    if (openTarget) {
      openRecipeDetail(openTarget.dataset.openRecipe);
      return;
    }
    const editNoteBtn = e.target.closest("[data-edit-note]");
    if (editNoteBtn) {
      state.editingNoteRecipeId = editNoteBtn.dataset.editNote;
      renderWishlistPane();
      const input = document.querySelector(`[data-note-input="${state.editingNoteRecipeId}"]`);
      if (input) input.focus();
      return;
    }
    const saveNoteBtn = e.target.closest("[data-save-note]");
    if (saveNoteBtn) {
      const id = saveNoteBtn.dataset.saveNote;
      const input = document.querySelector(`[data-note-input="${id}"]`);
      const note = input ? input.value.trim() : "";
      try {
        const res = await api.addWishlist(id, note);
        if (res.wishlist) state.wishlist = res.wishlist;
        state.editingNoteRecipeId = null;
        persistLocalSnapshot();
        renderWishlistPane();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    const cookBtn = e.target.closest("[data-cook-dish]");
    if (cookBtn) {
      await handleCookDish(cookBtn.dataset.cookDish);
      return;
    }
    const removeWishBtn = e.target.closest("[data-remove-wish]");
    if (removeWishBtn) {
      await toggleWishlistItem(removeWishBtn.dataset.removeWish);
      return;
    }
    const removeCustomBtn = e.target.closest("[data-remove-custom]");
    if (removeCustomBtn) {
      e.stopPropagation();
      try {
        const res = await api.mutateCustomItem({
          action: "remove",
          id: removeCustomBtn.dataset.removeCustom
        });
        if (res.wishlist) state.wishlist = res.wishlist;
        persistLocalSnapshot();
        renderWishlistPane();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    const customRow = e.target.closest("[data-toggle-custom]");
    if (customRow) {
      try {
        const res = await api.mutateCustomItem({
          action: "toggle",
          id: customRow.dataset.toggleCustom
        });
        if (res.wishlist) state.wishlist = res.wishlist;
        persistLocalSnapshot();
        renderWishlistPane();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    const pantryRow = e.target.closest("[data-toggle-pantry]");
    if (pantryRow) {
      const key = pantryRow.dataset.togglePantry;
      const nextVal = !Boolean(state.wishlist.checkedIngredients?.[key]);
      if (nextVal) state.wishlist.checkedIngredients[key] = true;
      else delete state.wishlist.checkedIngredients[key];
      renderWishlistPane();
      try {
        const res = await api.checkPantry({ key, checked: nextVal });
        if (res.wishlist) state.wishlist = res.wishlist;
        persistLocalSnapshot();
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  document
    .getElementById("clear-checked-pantry-btn")
    .addEventListener("click", async () => {
      try {
        const [r1, r2] = await Promise.all([
          api.checkPantry({ clearChecked: true }),
          api.mutateCustomItem({ action: "clearChecked" })
        ]);
        if (r2.wishlist) state.wishlist = r2.wishlist;
        else if (r1.wishlist) state.wishlist = r1.wishlist;
        persistLocalSnapshot();
        renderWishlistPane();
      } catch (err) {
        showToast(err.message);
      }
    });

  document.getElementById("custom-item-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("custom-item-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      const res = await api.mutateCustomItem({ action: "add", text });
      if (res.wishlist) state.wishlist = res.wishlist;
      persistLocalSnapshot();
      renderWishlistPane();
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("recipe-detail-content").addEventListener("click", async (e) => {
    const wishBtn = e.target.closest("[data-detail-wish]");
    if (wishBtn) {
      await toggleWishlistItem(wishBtn.dataset.detailWish);
      return;
    }
    const editBtn = e.target.closest("[data-detail-edit]");
    if (editBtn) {
      closeModal("recipe-detail-modal");
      openEditorForRecipe(editBtn.dataset.detailEdit);
      return;
    }
    const delBtn = e.target.closest("[data-detail-delete]");
    if (delBtn) {
      const id = delBtn.dataset.detailDelete;
      if (!window.confirm("确定要删除这道菜谱吗？删除后照片和做法都会一起移除。")) {
        return;
      }
      try {
        const res = await api.deleteRecipe(id);
        state.recipeCache.delete(id);
        if (res.index) state.index = res.index;
        if (res.wishlist) state.wishlist = res.wishlist;
        persistLocalSnapshot();
        closeModal("recipe-detail-modal");
        renderAll();
        showToast("已删除菜谱");
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    const ingBtn = e.target.closest("[data-search-ing]");
    if (ingBtn) {
      const ing = ingBtn.dataset.searchIng;
      closeModal("recipe-detail-modal");
      state.search = ing;
      searchInput.value = ing;
      clearSearchBtn.classList.remove("hidden");
      switchMobileTab("catalog");
      renderAll();
      showToast(`已帮你筛选包含「${ing}」的菜谱`);
      return;
    }
    const stepItem = e.target.closest("[data-toggle-step]");
    if (stepItem) {
      const idx = Number(stepItem.dataset.toggleStep);
      if (state.detailStepDone.has(idx)) state.detailStepDone.delete(idx);
      else state.detailStepDone.add(idx);
      stepItem.classList.toggle("done", state.detailStepDone.has(idx));
    }
  });

  document.getElementById("photo-preview-area").addEventListener("click", () => {
    document.getElementById("recipe-photo-input").click();
  });

  document.getElementById("recipe-photo-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeInfo = document.getElementById("photo-size-info");
    sizeInfo.textContent = "正在压缩图片…";
    try {
      const compressed = await compressImageFile(file);
      state.editor.imageBase64 = compressed.base64;
      state.editor.imageExt = compressed.ext;
      state.editor.removeImage = false;
      renderEditorPhotoPreview(compressed.dataUrl);
      sizeInfo.textContent = `已优化：${formatBytes(compressed.originalBytes)} → ${formatBytes(
        compressed.compressedBytes
      )}`;
    } catch (err) {
      sizeInfo.textContent = err.message;
    }
  });

  document.getElementById("remove-photo-btn").addEventListener("click", () => {
    state.editor.imageBase64 = null;
    state.editor.removeImage = true;
    document.getElementById("recipe-photo-input").value = "";
    document.getElementById("photo-size-info").textContent = "保存后将移除原照片";
    renderEditorPhotoPreview(null);
  });

  document.getElementById("editor-tags-picker").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-editor-tag]");
    if (!btn) return;
    const name = btn.dataset.editorTag;
    if (state.editor.tags.has(name)) state.editor.tags.delete(name);
    else state.editor.tags.add(name);
    renderEditorTagsPicker();
  });

  document.getElementById("editor-add-tag-btn").addEventListener("click", () => {
    const input = document.getElementById("editor-new-tag-input");
    const name = input.value.trim();
    if (!name) return;
    state.editor.tags.add(name);
    input.value = "";
    renderEditorTagsPicker();
  });

  const editorForm = document.getElementById("recipe-editor-form");
  editorForm.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target.id === "editor-new-tag-input") {
      e.preventDefault();
      document.getElementById("editor-add-tag-btn").click();
      return;
    }
    if (e.target.dataset.ingKind) {
      e.preventDefault();
      const kind = e.target.dataset.ingKind;
      const idx = Number(e.target.dataset.ingIdx);
      const list = kind === "main" ? state.editor.mainIngredients : state.editor.seasonings;
      if (e.target.dataset.ingField === "name") {
        const amtInput = editorForm.querySelector(
          `[data-ing-kind="${kind}"][data-ing-idx="${idx}"][data-ing-field="amount"]`
        );
        if (amtInput) amtInput.focus();
      } else if (idx === list.length - 1) {
        list.push({ name: "", amount: "" });
        renderEditorIngredients(kind);
        const nextName = editorForm.querySelector(
          `[data-ing-kind="${kind}"][data-ing-idx="${idx + 1}"][data-ing-field="name"]`
        );
        if (nextName) nextName.focus();
      }
    }
  });
  editorForm.addEventListener("input", (e) => {
    const ingKind = e.target.dataset.ingKind;
    if (ingKind) {
      const idx = Number(e.target.dataset.ingIdx);
      const field = e.target.dataset.ingField;
      const targetList =
        ingKind === "main" ? state.editor.mainIngredients : state.editor.seasonings;
      if (targetList[idx]) targetList[idx][field] = e.target.value;
      return;
    }
    if (e.target.dataset.stepIdx !== undefined) {
      const idx = Number(e.target.dataset.stepIdx);
      state.editor.steps[idx] = e.target.value;
    }
  });

  editorForm.addEventListener("click", (e) => {
    const addIng = e.target.closest("[data-add-ing]");
    if (addIng) {
      const kind = addIng.dataset.addIng;
      const list = kind === "main" ? state.editor.mainIngredients : state.editor.seasonings;
      list.push({ name: "", amount: "" });
      renderEditorIngredients(kind);
      return;
    }
    const remIng = e.target.closest("[data-remove-ing]");
    if (remIng) {
      const kind = remIng.dataset.removeIng;
      const idx = Number(remIng.dataset.idx);
      const list = kind === "main" ? state.editor.mainIngredients : state.editor.seasonings;
      list.splice(idx, 1);
      if (list.length === 0) list.push({ name: "", amount: "" });
      renderEditorIngredients(kind);
      return;
    }
    const remStep = e.target.closest("[data-remove-step]");
    if (remStep) {
      const idx = Number(remStep.dataset.removeStep);
      state.editor.steps.splice(idx, 1);
      if (state.editor.steps.length === 0) state.editor.steps.push("");
      renderEditorSteps();
      return;
    }
    const toggleBatch = e.target.closest("[data-toggle-batch]");
    if (toggleBatch) {
      const kind = toggleBatch.dataset.toggleBatch;
      document.getElementById(`batch-${kind}-box`).classList.toggle("hidden");
      return;
    }
    const applyBatch = e.target.closest("[data-apply-batch]");
    if (applyBatch) {
      const kind = applyBatch.dataset.applyBatch;
      if (kind === "steps") {
        const textarea = document.getElementById("batch-steps-textarea");
        const parsed = parseBatchSteps(textarea.value);
        if (parsed.length === 0) return;
        const existingNonEmpty = state.editor.steps.filter((s) => s.trim());
        state.editor.steps = [...existingNonEmpty, ...parsed];
        textarea.value = "";
        document.getElementById("batch-steps-box").classList.add("hidden");
        renderEditorSteps();
      } else {
        const textarea = document.getElementById(`batch-${kind}-textarea`);
        const parsed = parseBatchIngredients(textarea.value);
        if (parsed.length === 0) return;
        const list =
          kind === "main" ? state.editor.mainIngredients : state.editor.seasonings;
        const nonEmpty = list.filter((i) => i.name.trim() || i.amount.trim());
        const merged = [...nonEmpty, ...parsed];
        if (kind === "main") state.editor.mainIngredients = merged;
        else state.editor.seasonings = merged;
        textarea.value = "";
        document.getElementById(`batch-${kind}-box`).classList.add("hidden");
        renderEditorIngredients(kind);
      }
    }
  });

  document.getElementById("add-step-row-btn").addEventListener("click", () => {
    state.editor.steps.push("");
    renderEditorSteps();
  });

  editorForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveEditorRecipe(false);
  });
  document.getElementById("save-and-next-btn").addEventListener("click", () => {
    saveEditorRecipe(true);
  });

  document.getElementById("tag-manager-list").addEventListener("input", (e) => {
    const idx = e.target.dataset.tagEditIdx;
    const field = e.target.dataset.tagField;
    if (idx !== undefined && field && state.tagManagerDraft[idx]) {
      state.tagManagerDraft[idx][field] = e.target.value;
    }
  });

  document.getElementById("tag-manager-list").addEventListener("click", async (e) => {
    const saveBtn = e.target.closest("[data-save-tag-row]");
    if (saveBtn) {
      const idx = Number(saveBtn.dataset.saveTagRow);
      const item = state.tagManagerDraft[idx];
      if (!item || !item.name.trim()) {
        showToast("标签名不能为空");
        return;
      }
      const renameMap = {};
      if (item.origName && item.origName !== item.name.trim()) {
        renameMap[item.origName] = item.name.trim();
      }
      await commitTagManagerChanges(renameMap);
      renderSettingsModal();
      return;
    }
    const delBtn = e.target.closest("[data-delete-tag-row]");
    if (delBtn) {
      const idx = Number(delBtn.dataset.deleteTagRow);
      const item = state.tagManagerDraft[idx];
      if (!window.confirm(`确定删除标签「${item.name}」吗？菜谱上的该标签也会一起移除。`)) {
        return;
      }
      state.tagManagerDraft.splice(idx, 1);
      await commitTagManagerChanges({});
      renderSettingsModal();
    }
  });

  document.getElementById("tag-manager-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const emoji = document.getElementById("tag-emoji-input").value.trim() || "🏷️";
    const nameInput = document.getElementById("tag-name-input");
    const name = nameInput.value.trim();
    if (!name) return;
    const palette = ["sky", "gold", "coral", "sage", "wheat"];
    state.tagManagerDraft.push({
      name,
      emoji,
      color: palette[state.tagManagerDraft.length % palette.length],
      origName: name
    });
    nameInput.value = "";
    await commitTagManagerChanges({});
    renderSettingsModal();
  });

  document.getElementById("force-refresh-btn").addEventListener("click", async () => {
    state.recipeCache.clear();
    await loadInitialWorkspace();
    renderSettingsModal();
    showToast("已从云端刷新最新菜谱和清单");
  });

  document.getElementById("export-backup-btn").addEventListener("click", async () => {
    try {
      const data = await api.exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ameibao-recipes-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("备份文件已下载");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("seed-starters-btn").addEventListener("click", async () => {
    try {
      const res = await api.seedStarters();
      if (res.index) state.index = res.index;
      persistLocalSnapshot();
      renderAll();
      showToast(
        res.addedCount > 0 ? `已放入 ${res.addedCount} 道示例菜！` : "示例菜已经在菜单里啦"
      );
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api.logout();
    state.authenticated = false;
    state.recipeCache.clear();
    closeModal("settings-modal");
    renderLockScreen();
  });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.classList.add("hidden");
    });
  });
  document.getElementById("ameibao-celebration").addEventListener("click", (e) => {
    e.currentTarget.classList.add("hidden");
  });
}

bindEvents();
initApp();
