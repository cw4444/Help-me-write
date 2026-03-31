import { NextResponse } from "next/server";

async function complete(provider: string, apiKey: string, model: string, prompt: string) {
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.content?.map((c: { text?: string }) => c.text ?? "").join("");
  }
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: prompt }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.output_text as string;
}

export async function POST(req: Request) {
  const { provider, apiKey, model, story, character } = await req.json();
  const prompt = `Review the text for obvious typos and character inconsistencies only. Respond in JSON with keys summary, inconsistencies, typos.\n\nCharacter:\n${JSON.stringify(character)}\n\nText:\n${story}`;
  const raw = await complete(provider, apiKey, model, prompt);
  try {
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({
      summary: raw,
      inconsistencies: [],
      typos: [],
    });
  }
}
