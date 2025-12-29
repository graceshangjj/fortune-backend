import express from "express";
import crypto from "crypto";
import "dotenv/config";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Shopify App Proxy 签名校验
 * 官方说明：把 query 里除 signature 外的参数按 key 排序并拼接，然后用 API secret 做 HMAC-SHA256，对比 signature（hex）。
 * :contentReference[oaicite:4]{index=4}
 */
function verifyShopifyAppProxy(req) {
  if (process.env.DEV_SKIP_PROXY_VERIFY === "true") return true;

  const { signature, ...rest } = req.query;
  if (!signature) return false;

  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("");

  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  return digest === signature;
}

/**
 * 结构化 JSON Schema：强制模型输出固定结构（东方 / 西方 / 共同点）
 * Structured Outputs 参考：:contentReference[oaicite:5]{index=5}
 */
const fortuneSchema = {
  name: "fortune_reading_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["report_id", "overall", "east", "west", "common", "recommendations", "upsell", "disclaimer"],
    properties: {
      report_id: { type: "string" },

      overall: {
        type: "object",
        additionalProperties: false,
        required: ["score", "level", "one_liner"],
        properties: {
          score: { type: "integer", minimum: 0, maximum: 100 },
          level: { type: "string", enum: ["low", "mid", "high"] },
          one_liner: { type: "string" }
        }
      },

      // 模块 1：东方玄学
      east: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "love", "career", "money", "actions"],
        properties: {
          summary: { type: "string" },
          love: {
            type: "object",
            additionalProperties: false,
            required: ["score", "level", "insight"],
            properties: {
              score: { type: "integer", minimum: 0, maximum: 100 },
              level: { type: "string", enum: ["low", "mid", "high"] },
              insight: { type: "string" }
            }
          },
          career: {
            type: "object",
            additionalProperties: false,
            required: ["score", "level", "insight"],
            properties: {
              score: { type: "integer", minimum: 0, maximum: 100 },
              level: { type: "string", enum: ["low", "mid", "high"] },
              insight: { type: "string" }
            }
          },
          money: {
            type: "object",
            additionalProperties: false,
            required: ["score", "level", "insight"],
            properties: {
              score: { type: "integer", minimum: 0, maximum: 100 },
              level: { type: "string", enum: ["low", "mid", "high"] },
              insight: { type: "string" }
            }
          },
          actions: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: { type: "string" }
          }
        }
      },

      // 模块 2：西方玄学
      west: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "love", "career", "money", "actions"],
        properties: {
          summary: { type: "string" },
          love: {
            type: "object",
            additionalProperties: false,
            required: ["score", "level", "insight"],
            properties: {
              score: { type: "integer", minimum: 0, maximum: 100 },
              level: { type: "string", enum: ["low", "mid", "high"] },
              insight: { type: "string" }
            }
          },
          career: {
            type: "object",
            additionalProperties: false,
            required: ["score", "level", "insight"],
            properties: {
              score: { type: "integer", minimum: 0, maximum: 100 },
              level: { type: "string", enum: ["low", "mid", "high"] },
              insight: { type: "string" }
            }
          },
          money: {
            type: "object",
            additionalProperties: false,
            required: ["score", "level", "insight"],
            properties: {
              score: { type: "integer", minimum: 0, maximum: 100 },
              level: { type: "string", enum: ["low", "mid", "high"] },
              insight: { type: "string" }
            }
          },
          actions: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: { type: "string" }
          }
        }
      },

      // 模块 3：共同点（两套体系交集）
      common: {
        type: "object",
        additionalProperties: false,
        required: ["themes", "what_to_focus", "what_to_avoid"],
        properties: {
          themes: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } },
          what_to_focus: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } },
          what_to_avoid: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } }
        }
      },

      // 商品推荐（返回 Shopify product handle，前端用 /products/{handle}.js 拉商品渲染）
      recommendations: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["handle", "reason", "tag"],
          properties: {
            handle: { type: "string" },
            reason: { type: "string" },
            tag: { type: "string" }
          }
        }
      },

      // 付费详细解读 upsell
      upsell: {
        type: "object",
        additionalProperties: false,
        required: ["should_offer", "detailed_product_handle", "pitch"],
        properties: {
          should_offer: { type: "boolean" },
          detailed_product_handle: { type: "string" },
          pitch: { type: "string" }
        }
      },

      disclaimer: { type: "string" }
    }
  },
  strict: true
};

/**
 * 标准命理 Responses Prompt 模板（你可以长期复用）
 * 重点：不“伪造精确排盘细节”，而是用“倾向/主题/建议”表达。
 */
function buildFortunePrompt({ name, gender, birthDate, birthTime, birthCity, productCatalogHint }) {
  return `
你是一个“命理内容生成器”，只输出符合 JSON Schema 的结果。

【输入信息】
- name: ${name || "未提供"}
- gender: ${gender || "未提供"}
- birthDate: ${birthDate}
- birthTime: ${birthTime || "未知"}
- birthCity: ${birthCity || "未知"}

【输出要求（非常重要）】
1) 必须输出：东方玄学（east）、西方玄学（west）、共同点（common）三大模块。
2) 用“倾向/主题/建议”的方式表达，不要声称你做了精确排盘、不要编造具体星曜落宫/精确行星相位/度数。
3) 分数 score 用 0-100；level 用 low/mid/high；让三套模块的 love/career/money 分数彼此有区分但合理。
4) recommendations 必须返回可用的 Shopify 商品 handle（只从下列候选里选，不要自造）：
候选商品（handle 列表 + 含义提示）：
${productCatalogHint}

【推荐策略】
- 如果 love 偏低：推荐 1-2 个 “love_boost / love_guard” 相关商品（比如狐狸配饰）。
- 如果 overall level 为 low：upsell.should_offer = true，并给出自然、有说服力的 pitch。
- 如果整体较好：upsell 也可以 true，但 pitch 要更轻量（“进阶解读/年度规划”）。
`;
}

app.post("/api/fortune", async (req, res) => {
  try {
    // 1) 验签：确认来自 Shopify App Proxy
    if (!verifyShopifyAppProxy(req)) {
      return res.status(401).json({ error: "Invalid Shopify proxy signature" });
    }

    // 2) 读入参（前端传生日信息）
    const { name, gender, birthDate, birthTime, birthCity } = req.body || {};
    if (!birthDate) return res.status(400).json({ error: "birthDate is required" });

    // 3) 你自己的“可推荐商品候选池”（先写死，最适合小白；后面可改成从 Shopify 拉取）
    const productCatalogHint = [
      "- fox-charm：love_guard（爱情守护/提升自信）",
      "- rose-quartz-bracelet：love_boost（关系柔化/沟通）",
      "- calm-aroma：calm_sleep（安神/情绪稳定）",
      "- wealth-amulet：money_boost（财务信心/行动力）",
      "- career-talisman：career_boost（事业专注/贵人）",
      "- detailed-reading：付费详细解读服务（数字商品）"
    ].join("\n");

    // 4) 调 OpenAI：Responses + Structured Outputs（JSON Schema）
    const response = await client.responses.create({
      model: "gpt-5",
      reasoning: { effort: "low" },
      input: buildFortunePrompt({
        name,
        gender,
        birthDate,
        birthTime,
        birthCity,
        productCatalogHint
      }),
      response_format: {
        type: "json_schema",
        json_schema: fortuneSchema
      }
    });

    // OpenAI SDK 常用 output_text 便捷字段（把所有 text 聚合成一个字符串）:contentReference[oaicite:6]{index=6}
    // 但这里我们要求 json_schema，通常 SDK 会直接给到结构化内容；为了稳妥，兼容解析一次：
    let result;
    if (typeof response.output_text === "string" && response.output_text.trim()) {
      result = JSON.parse(response.output_text);
    } else {
      // 兜底：如果 SDK 没给 output_text，你也可以从 response.output 里解析（这里给小白先省略）
      throw new Error("Model output missing output_text; please check SDK version / response_format behavior.");
    }

    // 5) 返回给前端（前端只负责渲染）
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      message: String(err?.message || err)
    });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`API server running on http://localhost:${port}`));
