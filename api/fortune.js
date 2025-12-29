export default async function handler(req, res) {
  try {
    // ===== CORS 预检 =====
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    // ===== CORS 实际请求 =====
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        hint: "API is alive. Use POST with JSON body."
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const body = req.body ?? {};
    const { birthDate, birthTime, birthCity } = body;

    if (!birthDate) {
      return res.status(400).json({
        error: "birthDate is required",
        receivedBody: body
      });
    }

    return res.status(200).json({
      ok: true,
      east: { score: 72 },
      west: { score: 65 },
      common: { score: 70 }
    });
  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      message: String(e?.message || e)
    });
  }
}
