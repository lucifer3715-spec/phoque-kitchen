const AMOUNT_UNITS =
  "(?:kg|g|ml|l|mg|斤|两|克|千克|毫升|升|大勺|小勺|汤匙|茶匙|勺|匙|个|颗|粒|根|条|块|片|瓣|朵|张|段|把|束|株|只|头|碗|杯|盒|袋|包|瓶|罐|滴)";

const TRAILING_AMOUNT_RE = new RegExp(
  `^(.*?)\\s*((?:[0-9]+(?:\\.[0-9]+)?(?:\\s*[-~～到]\\s*[0-9]+(?:\\.[0-9]+)?)?|半|几|一|两|三|四|五|六|七|八|九|十)+\\s*${AMOUNT_UNITS}|适量|少许|若干|一点点?)$`,
  "i"
);

export function parseSingleIngredientLine(rawLine) {
  const line = String(rawLine || "")
    .replace(/^[\s•·\-*✅☑️]+/, "")
    .replace(/^\d+[.)、]\s*/, "")
    .trim();
  if (!line) return null;

  // Colon separator: "牛腩：500g"
  const colonMatch = line.match(/^([^:：]+)[:：]\s*(.+)$/);
  if (colonMatch) {
    return {
      name: colonMatch[1].trim(),
      amount: colonMatch[2].trim()
    };
  }

  // Space-separated: "牛腩 500g" or "匈牙利红甜椒粉 Paprika 2大勺"
  const lastSpaceIdx = line.lastIndexOf(" ");
  if (lastSpaceIdx > 0) {
    const left = line.slice(0, lastSpaceIdx).trim();
    const right = line.slice(lastSpaceIdx + 1).trim();
    if (
      right &&
      (/^([0-9一二两三四五六七八九十半几]|适量|少许|若干|一点)/.test(right) ||
        new RegExp(`^${AMOUNT_UNITS}$`, "i").test(right))
    ) {
      return { name: left, amount: right };
    }
  }

  // Attached trailing unit: "大蒜4瓣", "盐适量", "洋葱半个"
  const attached = line.match(TRAILING_AMOUNT_RE);
  if (attached && attached[1].trim()) {
    return {
      name: attached[1].trim(),
      amount: attached[2].trim()
    };
  }

  return { name: line, amount: "" };
}

export function parseBatchIngredients(text) {
  const chunks = String(text || "")
    .split(/[\r\n,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const chunk of chunks) {
    const parsed = parseSingleIngredientLine(chunk);
    if (parsed && parsed.name) {
      out.push(parsed);
    }
  }
  return out;
}

export function parseBatchSteps(text) {
  return String(text || "")
    .split(/\r?\n+/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:第[一二三四五六七八九十百0-9]+步|步骤\s*\d+|step\s*\d+)\s*[:：.、]?\s*/i, "")
        .replace(/^\d+\s*[.)、:：]\s*/, "")
        .trim()
    )
    .filter(Boolean);
}

function parseNumericAmount(amountStr) {
  const m = String(amountStr || "")
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z\u4e00-\u9fa5]+)$/);
  if (!m) return null;
  return { value: Number(m[1]), unit: m[2].toLowerCase() };
}

function formatGroupSummary(occurrences) {
  if (occurrences.length === 1) {
    const occ = occurrences[0];
    return {
      totalText: occ.amount || "适量",
      detailText: occ.recipeTitle
    };
  }

  const parsedNums = occurrences.map((o) => parseNumericAmount(o.amount));
  const allValidSameUnit =
    parsedNums.every(Boolean) &&
    parsedNums.every((p) => p.unit === parsedNums[0].unit);

  const detailText = occurrences
    .map((o) => (o.amount ? `${o.recipeTitle} ${o.amount}` : o.recipeTitle))
    .join(" · ");

  if (allValidSameUnit) {
    const sum = parsedNums.reduce((acc, p) => acc + p.value, 0);
    const rounded = Number.isInteger(sum) ? sum : Number(sum.toFixed(1));
    return {
      totalText: `共 ${rounded}${parsedNums[0].unit}`,
      detailText
    };
  }

  const amounts = occurrences.map((o) => o.amount).filter(Boolean);
  return {
    totalText: amounts.length > 0 ? amounts.join(" + ") : `${occurrences.length}道菜需要`,
    detailText
  };
}

export function mergePantryIngredients(wishlistItems, recipeCacheMap) {
  const mainMap = new Map();
  const seasoningMap = new Map();
  const missingRecipeIds = [];

  for (const wItem of wishlistItems || []) {
    const recipe = recipeCacheMap.get(wItem.recipeId);
    if (!recipe) {
      missingRecipeIds.push(wItem.recipeId);
      continue;
    }

    for (const ing of recipe.mainIngredients || []) {
      const name = String(ing.name || "").trim();
      if (!name) continue;
      const norm = name.toLowerCase();
      const key = `main:${norm}`;
      if (!mainMap.has(key)) {
        mainMap.set(key, { key, name, occurrences: [] });
      }
      mainMap.get(key).occurrences.push({
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        amount: String(ing.amount || "").trim()
      });
    }

    for (const sea of recipe.seasonings || []) {
      const name = String(sea.name || "").trim();
      if (!name) continue;
      const norm = name.toLowerCase();
      const key = `sea:${norm}`;
      if (!seasoningMap.has(key)) {
        seasoningMap.set(key, { key, name, occurrences: [] });
      }
      seasoningMap.get(key).occurrences.push({
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        amount: String(sea.amount || "").trim()
      });
    }
  }

  const finalize = (map) =>
    Array.from(map.values()).map((entry) => ({
      key: entry.key,
      name: entry.name,
      ...formatGroupSummary(entry.occurrences)
    }));

  return {
    mainGroups: finalize(mainMap),
    seasoningGroups: finalize(seasoningMap),
    missingRecipeIds
  };
}
