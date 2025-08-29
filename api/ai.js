// api/ai.js — Vercel serverless function (Node 18+)
export default async (req, res) => {
  try {
    const { state, playerInput } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const system = `
You are MORPHEUS/DM for a Matrix text RPG. Rules:
- Output STRICT JSON: {"narration":"...","actions":[...]}
- "actions" ⊆ ["spawnEncounter","awardCredits","offerShop","setScene","savePortal","gameOver","noOp"]
- Stay in-world. Keep replies short (<= 60 words unless boss moment).
`;

    const tools = [{
      type: "function",
      function: {
        name: "engine",
        description: "Select engine actions to mutate game state.",
        parameters: {
          type: "object",
          properties: {
            actions: {
              type: "array",
              items: { type: "string", enum:
                ["spawnEncounter","awardCredits","offerShop","setScene","savePortal","gameOver","noOp"]
              }
            }
          },
          required: ["actions"]
        }
      }
    }];

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",      // good balance of cost/quality; you can change later
        messages: [
          { role: "system", content: system },
          { role: "user", content: [
              { type: "text", text: `GAME_STATE:\n${JSON.stringify(state)}` },
              { type: "text", text: `PLAYER_INPUT:\n${playerInput}` }
            ] }
        ],
        tools,
        response_format: { type: "json_object" },
        temperature: 0.7,
        stream: false
      })
    });

    const data = await r.json();
    const tool = data?.output?.[0]?.content?.find?.(c => c.type === "tool")?.tool_call;
    const textObj = data?.output?.[0]?.content?.find?.(c => c.type === "output_text");
    const payload = tool ? tool.arguments
      : (textObj ? JSON.parse(textObj.text) : { narration: "…", actions: ["noOp"] });

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(payload);
  } catch (e) {
    res.status(500).send({ error: e.message });
  }
};
