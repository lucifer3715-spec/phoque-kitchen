export const DEFAULT_TAGS = [
  { name: "拿手菜", emoji: "⭐", color: "gold" },
  { name: "肉菜", emoji: "🍖", color: "coral" },
  { name: "素菜", emoji: "🥬", color: "sage" },
  { name: "汤羹", emoji: "🍲", color: "sky" },
  { name: "冬季菜", emoji: "❄️", color: "sky" },
  { name: "快手下饭", emoji: "🍚", color: "gold" },
  { name: "主食面点", emoji: "🍜", color: "wheat" },
  { name: "甜点小食", emoji: "🍮", color: "coral" }
];

export function createEmptyIndex() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    tags: DEFAULT_TAGS.map((t) => ({ ...t })),
    recipes: []
  };
}

export function createEmptyWishlist() {
  return {
    version: 1,
    items: [],
    checkedIngredients: {},
    customItems: [],
    feedCount: 0,
    history: [],
    updatedAt: new Date().toISOString()
  };
}

export function normalizeIndex(raw) {
  const base = createEmptyIndex();
  if (!raw || typeof raw !== "object") return base;
  return {
    version: 1,
    updatedAt: raw.updatedAt || base.updatedAt,
    tags: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags : base.tags,
    recipes: Array.isArray(raw.recipes) ? raw.recipes : []
  };
}

export function normalizeWishlist(raw) {
  const base = createEmptyWishlist();
  if (!raw || typeof raw !== "object") return base;
  return {
    version: 1,
    items: Array.isArray(raw.items) ? raw.items : [],
    checkedIngredients:
      raw.checkedIngredients && typeof raw.checkedIngredients === "object"
        ? raw.checkedIngredients
        : {},
    customItems: Array.isArray(raw.customItems) ? raw.customItems : [],
    feedCount: Number.isFinite(raw.feedCount) ? raw.feedCount : 0,
    history: Array.isArray(raw.history) ? raw.history : [],
    updatedAt: raw.updatedAt || base.updatedAt
  };
}

export function normalizeIngredientList(list) {
  if (!Array.isArray(list)) return [];
  const cleaned = [];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === "string") {
      const name = item.trim();
      if (name) cleaned.push({ name, amount: "" });
    } else {
      const name = String(item.name || "").trim();
      const amount = String(item.amount || "").trim();
      if (name) cleaned.push({ name, amount });
    }
  }
  return cleaned;
}

export function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((s) => String(s || "").trim()).filter(Boolean);
}

export function normalizeTagNames(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of tags) {
    const name = String(raw || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

export function buildRecipeSummary(recipe) {
  const tips = String(recipe.tips || "").trim();
  return {
    id: recipe.id,
    title: recipe.title,
    tags: normalizeTagNames(recipe.tags),
    mainIngredients: (recipe.mainIngredients || []).map((x) => x.name),
    seasonings: (recipe.seasonings || []).map((x) => x.name),
    status: recipe.status === "draft" ? "draft" : "complete",
    imagePath: recipe.imagePath || null,
    notePreview: tips.length > 60 ? `${tips.slice(0, 60)}...` : tips,
    cookCount: Number.isFinite(recipe.cookCount) ? recipe.cookCount : 0,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt
  };
}

export function mergeTagsIntoIndex(index, tagNames) {
  const existing = new Set((index.tags || []).map((t) => t.name));
  const palette = ["sky", "gold", "coral", "sage", "wheat"];
  for (const name of tagNames) {
    if (!existing.has(name)) {
      existing.add(name);
      const color = palette[index.tags.length % palette.length];
      index.tags.push({ name, emoji: "🏷️", color });
    }
  }
}

export function generateRecipeId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `rec_${ts}_${rand}`;
}

export function getSeedRecipes() {
  const now = new Date().toISOString();
  return [
    {
      id: "rec_seed_goulash",
      title: "匈牙利炖牛肉 Goulash",
      tags: ["肉菜", "冬季菜", "拿手菜"],
      mainIngredients: [
        { name: "牛腱子或牛腩", amount: "600g" },
        { name: "洋葱", amount: "2个" },
        { name: "土豆", amount: "2个" },
        { name: "胡萝卜", amount: "1根" },
        { name: "番茄", amount: "2个" }
      ],
      seasonings: [
        { name: "匈牙利红甜椒粉 Paprika", amount: "2大勺" },
        { name: "番茄膏", amount: "1大勺" },
        { name: "葛缕子粉或孜然", amount: "半小勺" },
        { name: "大蒜", amount: "4瓣" },
        { name: "黄油", amount: "20g" },
        { name: "盐与黑胡椒", amount: "适量" }
      ],
      steps: [
        "牛腩切 3cm 大块擦干水分；洋葱切丝，土豆和胡萝卜切滚刀块。",
        "锅中融化黄油和少许橄榄油，中小火把洋葱炒至焦糖微黄，加入蒜末炒香。",
        "离火拌入红甜椒粉避免炒糊，再倒回牛肉块大火翻炒变色，加入番茄膏和去皮番茄块。",
        "加温水或牛高汤没过食材，小火慢炖 1 小时后放入土豆和胡萝卜再炖 30 分钟，最后加盐和黑胡椒调味。"
      ],
      tips: "红甜椒粉一定要稍微离火拌匀，不然容易苦；第二天复热配法棍或米饭更香！",
      status: "complete",
      imagePath: null,
      cookCount: 3,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "rec_seed_tomato_beef",
      title: "番茄滑蛋肥牛",
      tags: ["快手下饭", "肉菜"],
      mainIngredients: [
        { name: "肥牛卷", amount: "250g" },
        { name: "番茄", amount: "3个" },
        { name: "鸡蛋", amount: "3个" }
      ],
      seasonings: [
        { name: "生抽", amount: "1.5勺" },
        { name: "番茄酱", amount: "1勺" },
        { name: "白糖", amount: "1小勺" },
        { name: "料酒", amount: "1勺" },
        { name: "葱花", amount: "少许" }
      ],
      steps: [
        "肥牛卷冷水下锅加少许料酒焯水变色立刻捞出；鸡蛋打散加少许温水滑炒成嫩蛋盛出。",
        "锅中炒香葱白，倒入去皮切丁的番茄炒出沙，加番茄酱、生抽、白糖煮出浓郁汤汁。",
        "倒回肥牛和嫩滑鸡蛋翻拌裹匀汤汁，撒葱花出锅。"
      ],
      tips: "肥牛焯水十秒变色就捞出来，千万别煮老啦，汤汁拌米饭超绝。",
      status: "complete",
      imagePath: null,
      cookCount: 5,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "rec_seed_pumpkin_soup",
      title: "奶香贝贝南瓜浓汤",
      tags: ["汤羹", "素菜", "冬季菜"],
      mainIngredients: [
        { name: "贝贝南瓜", amount: "1个" },
        { name: "洋葱", amount: "半个" },
        { name: "淡奶油或牛奶", amount: "150ml" }
      ],
      seasonings: [
        { name: "黄油", amount: "15g" },
        { name: "海盐", amount: "少许" },
        { name: "现磨黑胡椒", amount: "少许" }
      ],
      steps: [
        "贝贝南瓜去籽切块蒸熟或炒软，洋葱切碎用黄油小火炒香。",
        "把南瓜、洋葱和适量清水放入破壁机打至细腻顺滑。",
        "倒回奶锅小火加热，拌入淡奶油/牛奶，加少许海盐与黑胡椒即可。"
      ],
      tips: "冷天晚上配烤吐司喝一碗，从胃暖到脚趾～",
      status: "complete",
      imagePath: null,
      cookCount: 2,
      createdAt: now,
      updatedAt: now
    }
  ];
}
