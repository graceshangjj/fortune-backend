import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const {
    name,
    gender,
    birthDate,
    birthTime,
    birthCity
  } = req.body;

  // 这里之后接你已经写好的 prompt + OpenAI 调用
  res.status(200).json({
    east: { score: 72 },
    west: { score: 65 },
    common: { score: 70 }
  });
}
