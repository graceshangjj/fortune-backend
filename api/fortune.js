import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ 只允许从这些 handle 里推荐（你后面换成真实商品）
const ALLOWED_HANDLES = [
  "fox-charm",
  "rose-quartz-bracelet",
  "obsidian-ring",
  "detailed-reading"
];

function clampScore(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return 50;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function normalizeLevel(score) {
  if (score <= 40) return "low";
  if (score <= 70) return "mid";
  return "high";
}

function enforceHandles(recs = []) {
  return (Array.isArray(recs) ? recs : [])
    .filter(r => r && ALLOWED_HANDLES.includes(r.handle))
    .slice(0, 3);
}

export default async function handler(req, res) {
  try {
    // ===== CORS 预检 =====
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        hint: "Use POST /api/fortune with JSON body."
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const body = req.body ?? {};
    const {
      name = "",
      gender = "",
      birthDate,
      birthTime = "",
      birthCity = ""
    } = body;

    if (!birthDate) {
      return res.status(400).json({ error: "birthDate is required", receivedBody: body });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in Vercel env vars" });
    }

    // ===== 让模型输出 JSON（我们再做一层校验兜底）=====
    const system = `
你是一个“命理内容生成器”，必须输出严格的 JSON（不要 markdown，不要多余文字）。
要求包含三大模块：east（东方玄学）、west（西方玄学）、common（共同点），并给出商品推荐 recommendations 与付费 upsell。

注意：
- 不要声称做了精确排盘，不要编造具体星曜落宫/精确行星相位/度数。
- 分数 score 0-100；level 只能是 low/mid/high；love/career/money 需要合理且有区分。
- recommendations 只能从允许的 handle 列表中挑选（不要自造）。
`;

    const user = {
      input: { name, gender, birthDate, birthTime, birthCity },
      allowed_handles: ALLOWED_HANDLES,
      rules: {
        recommend_strategy: [
          "如果 love 偏低：推荐 1-2 个 love_boost / love_guard 相关商品（例如 fox-charm）。",
          "如果 overall level 为 low：upsell.should_offer = true，pitch 要自然且有说服力。",
          "如果整体较好：upsell 也可以 true，但 pitch 更轻量（进阶解读/年度规划）。"
        ]
      },
      output_schema_hint: {
        overall: { score: 0, level: "mid", one_liner: "" },
        east: {
          summary: "",
          love: { score: 0, level: "mid", insight: "" },
          career: { score: 0, level: "mid", insight: "" },
          money: { score: 0, level: "mid", insight: "" },
          actions: []
        },
        west: {
          summary: "",
          love: { score: 0, level: "mid", insight: "" },
          career: { score: 0, level: "mid", insight: "" },
          money: { score: 0, level: "mid", insight: "" },
          actions: []
        },
        common: {
          themes: [],
          what_to_focus: [],
          what_to_avoid: []
        },
        recommendations: [{ handle: "", reason: "", tag: "" }],
        upsell: { should_offer: true, detailed_product_handle: "detailed-reading", pitch: "" },
        disclaimer: ""
      }
    };

    // 用 Responses API（更稳）
    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
      ],
      temperature: 0.8
    });

    const text = resp.output_text?.trim?.() || "";
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // 如果模型没输出纯 JSON，兜底
      data = null;
    }

    if (!data) {
      return res.status(200).json({
        ok: true,
        warning: "Model did not return valid JSON. Using fallback.",
        overall: { score: 70, level: "mid", one_liner: "Energy is steady—focus on consistency." },
        east: { summary: "", love: { score: 62, level: "mid", insight: "" }, career: { score: 74, level: "high", insight: "" }, money: { score: 66, level: "mid", insight: "" }, actions: [] },
        west: { summary: "", love: { score: 58, level: "mid", insight: "" }, career: { score: 72, level: "high", insight: "" }, money: { score: 64, level: "mid", insight: "" }, actions: [] },
        common: { themes: ["stability"], what_to_focus: ["clarity"], what_to_avoid: ["overthinking"] },
        recommendations: [{ handle: "fox-charm", reason: "Support confidence and relationship clarity.", tag: "love_guard" }],
        upsell: { should_offer: true, detailed_product_handle: "detailed-reading", pitch: "Unlock a deeper, actionable reading for the next 30 days." },
        disclaimer: "For entertainment and self-reflection only."
      });
    }

    // ===== 二次校验：修正 score/level + 限制 handle =====
    const overallScore = clampScore(data?.overall?.score);
    const normalized = {
      ...data,
      ok: true,
      overall: {
        score: overallScore,
        level: data?.overall?.level ?? normalizeLevel(overallScore),
        one_liner: data?.overall?.one_liner ?? ""
      }
    };

    // normalize each section
    for (const k of ["east", "west"]) {
      for (const dim of ["love", "career", "money"]) {
        const s = clampScore(normalized?.[k]?.[dim]?.score);
        normalized[k][dim] = {
          ...normalized[k][dim],
          score: s,
          level: normalized?.[k]?.[dim]?.level ?? normalizeLevel(s)
        };
      }
      normalized[k].actions = Array.isArray(normalized?.[k]?.actions) ? normalized[k].actions.slice(0, 5) : [];
    }

    normalized.recommendations = enforceHandles(normalized?.recommendations);
    if (!normalized.recommendations.length) {
      normalized.recommendations = [{ handle: "fox-charm", reason: "A gentle support item to boost confidence.", tag: "love_guard" }];
    }

    if (!normalized.upsell) normalized.upsell = {};
    normalized.upsell.detailed_product_handle = "detailed-reading";
    normalized.disclaimer = normalized.disclaimer || "For entertainment and self-reflection only.";

    return res.status(200).json(normalized);
  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      message: String(e?.message || e)
    });
  }
}
