export default async function handler(req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { state = {}, playerInput = "", logTail = "" } = body;

    const prompt = `
You are the adaptive DM for a Matrix text RPG.
Player input: "${playerInput}"
State: ${JSON.stringify(state)}
Recent log:
${logTail}

Return STRICT JSON ONLY:
{
  "narration": "2–5 sentences, cinematic Matrix tone.",
  "actions": [
    {"type":"spawnEncounter"},
    {"type":"awardCredits","args":{"amount":10}},
    {"type":"offerShop"},
    {"type":"setScene","args":{"name":"construct"}},
    {"type":"savePortal"},
    {"type":"gameOver"},
    {"type":"noOp"}
  ]
}
`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        messages: [
          { role: "system", content: "You are a cinematic Matrix RPG DM. JSON only." },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await r.json();
    let text = data?.choices?.[0]?.message?.content || "";
    let out;
    try { out = JSON.parse(text); }
    catch { out = { narration: text || "…", actions: [{ type: "noOp" }] }; }

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
