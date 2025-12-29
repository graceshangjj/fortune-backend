export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, hint: "Use POST with JSON body." });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed", hint: "Use POST" });
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

    return res.status(200).json({
      ok: true,
      received: { name, gender, birthDate, birthTime, birthCity },
      east: { score: 72 },
      west: { score: 65 },
      common: { score: 70 }
    });
  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      message: String(e?.message || e),
      stack: e?.stack || null
    });
  }
}
