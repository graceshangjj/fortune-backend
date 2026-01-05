function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseUnlockCodes() {
  // 在 Vercel 环境变量里配置：UNLOCK_CODES="CODE1,CODE2,CODE3"
  const raw = process.env.UNLOCK_CODES || "";
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function isValidUnlockCode(code, allowed) {
  if (!code) return false;
  const normalized = String(code).trim();
  return allowed.includes(normalized);
}

function buildFreeResult({ birthDate, birthTime, birthCity }) {
  // ✅ 免费内容：先用稳定的“轻量版”，之后你再换成 OpenAI 生成也行
  // 这里做一个简单的“伪差异化”，让用户每次输入不同也会略不同
  const seed = `${birthDate || ""}-${birthTime || ""}-${birthCity || ""}`.length;

  const eastLove = 50 + (seed % 20);
  const westLove = 48 + ((seed + 7) % 22);
  const commonScore = 55 + ((seed + 3) % 18);

  return {
    east: {
      summary: "东方视角：强调情绪稳定与人际边界，适合用“温和但坚定”的方式推进关系。",
      love: { score: eastLove, level: eastLove <= 40 ? "low" : eastLove <= 70 ? "mid" : "high", insight: "别急着证明自己，先把底线说清楚。" },
      career: { score: 72, level: "high", insight: "适合把目标拆小，持续推进，贵在坚持。" },
      money: { score: 61, level: "mid", insight: "控制冲动消费，先存后花更稳。" },
      actions: ["睡眠优先", "减少内耗沟通", "做一件能立刻完成的小事"]
    },
    west: {
      summary: "西方视角：更偏向自我节奏与自我价值感重建，适合“慢一点、准一点”。",
      love: { score: westLove, level: westLove <= 40 ? "low" : westLove <= 70 ? "mid" : "high", insight: "用更清晰的表达替代揣测。" },
      career: { score: 68, level: "mid", insight: "提升曝光与表达，你的机会来自被看见。" },
      money: { score: 59, level: "mid", insight: "把预算按周拆分，减少焦虑。" },
      actions: ["写下3个真正想要的", "每天一次主动表达", "减少无效社交"]
    },
    common: {
      themes: ["稳定", "边界", "节奏感"],
      what_to_focus: ["持续行动", "清晰表达", "情绪管理"],
      what_to_avoid: ["过度解读", "情绪化决策", "冲动消费"],
      score: commonScore
    }
  };
}

function buildPaidDeepDive({ free }) {
  // ✅ 付费内容：先用结构化模板，后面你可以再接 OpenAI 深度解读
  const loveLevel = free?.east?.love?.level || "mid";
  const focus = loveLevel === "low" ? "修复关系能量与边界" : "把关系推进到更稳定的阶段";

  return {
    title: "详细解读：30 天行动方案",
    focus,
    timeline: [
      { week: 1, goal: "稳住节奏，减少内耗", tasks: ["每天 10 分钟写情绪日记", "做一次断舍离（关系/物品）"] },
      { week: 2, goal: "修复表达方式", tasks: ["练习 1 次清晰表达需求", "减少试探式沟通"] },
      { week: 3, goal: "建立吸引力与稳定感", tasks: ["建立运动/睡眠习惯", "安排一次高质量社交"] },
      { week: 4, goal: "复盘并升级", tasks: ["复盘最有效的方法", "制定下个月策略"] }
    ],
    product_recos: [
      { handle: "fox-charm", reason: "偏向关系守护与自信提升，适合低迷阶段的稳定支持。", tag: "love_guard" }
    ],
    disclaimer: "For entertainment and self-reflection only."
  };
}

export default async function handler(req, res) {
  try {
    // CORS 预检
    if (req.method === "OPTIONS") {
      cors(res);
      return res.status(204).end();
    }
    cors(res);

    if (req.method === "GET") {
      return res.status(200).json({ ok: true, hint: "Use POST /api/fortune with JSON body." });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const body = req.body ?? {};
    const { name = "", gender = "", birthDate, birthTime = "", birthCity = "", unlock_code = "" } = body;

    if (!birthDate) {
      return res.status(400).json({ error: "birthDate is required", receivedBody: body });
    }

    // Step A：先生成免费内容（永远返回）
    const free = buildFreeResult({ birthDate, birthTime, birthCity });

    // Step B：校验是否已付费（unlock_code）
    const allowedCodes = parseUnlockCodes();
    const unlocked = isValidUnlockCode(unlock_code, allowedCodes);

    if (unlocked) {
      const deep_dive = buildPaidDeepDive({ free });
      return res.status(200).json({
        ok: true,
        user: { name, gender, birthDate, birthTime, birthCity },
        free,
        paid: { unlocked: true, deep_dive },
        upsell: { should_offer: false }
      });
    }

    // 未解锁：返回 upsell 信息（前端展示购买按钮）
    return res.status(200).json({
      ok: true,
      user: { name, gender, birthDate, birthTime, birthCity },
      free,
      paid: { unlocked: false, deep_dive: null },
      upsell: {
        should_offer: true,
        product_handle: "detailed-reading",
        pitch: "想要更详细的解读吗？解锁你的专属建议（30天行动方案 + 重点提醒 + 推荐配饰）。"
      }
    });
  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      message: String(e?.message || e)
    });
  }
}
