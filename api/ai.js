// /api/ai.js
// Dynamic Matrix RPG brain with memory patches.
// Requires OPENAI_API_KEY in Vercel → Settings → Environment Variables.

export default async function handler(req, res) {
  // CORS for local tests and Vercel
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const { playerInput = "", state = {}, memory = {}, log = [] } = await readJson(req);

    const system = `
You are the adaptive game engine for a Matrix-themed text RPG.
Core goals: fast-paced cinematic narration, accept ANY input, and progress the story.
You must NEVER refuse or stall. If input is strange, interpret creatively and move forward.

STYLE:
- Tight, vivid prose (<= 4 sentences per turn), high momentum, cinematic beats.
- Use present tense. Slip subtle Matrix flavor (agents, Sentinels, hacks, rooftops, déjà vu).
- Keep it PG-13. No graphic content.

WORLD STATE:
- "state": mutable world state (location, hp/mp, inventory, credits, threat, boss phases, etc.)
- "memory": long-lived player-focused memory (facts, goals, NPCs, style preferences). Keep it compact.
- "log": last exchanges for local context.

RESPONSE FORMAT (JSON only):
{
  "narration": "string (<=160 words, tight, cinematic, moves plot forward)",
  "actions": [ {"label":"short clickable text","cmd":"what the player might type next"} ]  // optional suggestions
  "state_patch": { ...only changed keys... },      // optional shallow patch
  "memory_patch": { ...only changed keys... },    // optional shallow patch (facts/goals/NPCs/preferences)
  "effects": { "hpDelta":0, "mpDelta":0, "creditsDelta":0 }  // optional numeric deltas
}

RULES:
- Always return valid JSON. No markdown, no code fences.
- If the player's input is off-track, interpret it and continue the quest.
- Update memory minimally (e.g., add a goal if the player sets one, remember chosen weapon, note fears).
- If combat escalates, include consequences in state_patch/effects but keep narration concise.
- If player tries meta commands (save/reset/help), you may reflect them narratively, but still return valid JSON.
`;

    const user = JSON.stringify({
      playerInput,
      state,
      memory,
      recentLog: log.slice(-12),
    });

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.85,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    const data = await completion.json();

    let raw = data?.choices?.[0]?.message?.content ?? "";
    // Try to find JSON even if the model wraps it
    const json = tryExtractJson(raw);

    // Safe defaults to never stall
    const safe = {
      narration: json?.narration || "Neo-static flickers. You steady yourself. Even a weird move shifts fate here—what’s your next play?",
      actions: Array.isArray(json?.actions) ? json.actions.slice(0, 5) : [],
      state_patch: isPlainObject(json?.state_patch) ? json.state_patch : {},
      memory_patch: isPlainObject(json?.memory_patch) ? json.memory_patch : {},
      effects: isPlainObject(json?.effects) ? json.effects : {}
    };

    return res.status(200).json(safe);
  } catch (err) {
    console.error("AI handler error:", err);
    return res.status(200).json({
      narration: "Static surges across the lines—connection is noisy, but you can still move. Try another action.",
      actions: [{ label: "scan room", cmd: "scan room" }, { label: "answer phone", cmd: "answer phone" }, { label: "hide", cmd: "hide" }],
      state_patch: {},
      memory_patch: {},
      effects: {}
    });
  }
}

// Helpers
async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function tryExtractJson(text) {
  try { return JSON.parse(text); } catch (_) {}
  // try sneaky JSON substring
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

function isPlainObject(o) {
  return !!o && typeof o === "object" && !Array.isArray(o);
}
