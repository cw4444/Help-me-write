import { NextResponse } from "next/server";

async function streamOpenAI(apiKey: string, model: string, prompt: string) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: prompt, stream: true }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.body!;
}

async function streamAnthropic(apiKey: string, model: string, prompt: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({ model, max_tokens: 900, stream: true, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.body!;
}

export async function POST(req: Request) {
  const body = await req.json();
  const { provider, apiKey, model, mode, story, prompt, spice, contentMode, startMode, writer, character } = body;
  const modeGuidance =
    contentMode === "spicy"
      ? "The writer wants a spicy tone, but still keep everything within platform-safe and legal limits. No explicit sexual content if policy would disallow it."
      : contentMode === "romance"
        ? "The writer wants a romantic tone. Keep intimacy light, tender, and non-explicit."
        : contentMode === "closed_door"
          ? "Keep romantic intimacy implied off-page; no explicit detail."
          : "Use a fade-to-black style for intimacy and keep the scene tasteful and non-explicit.";
  const system = [
    `You are a writing assistant.`,
    `Writer profile: ${writer?.name || "anonymous"} | tone: ${writer?.tone || ""} | house style: ${writer?.houseStyle || ""}`,
    `Spice level: ${spice}/5. Keep within platform-safe content; do not become explicit if the request pushes too far.`,
    `Content mode: ${contentMode || "fade_to_black"}. ${modeGuidance}`,
    `Adult interactions must be clearly consensual, voluntary, and between adults.`,
    `Adult and erotic content is allowed only when it stays within applicable policy and law. Never generate illegal sexual content, sexual content involving minors, coercion, exploitation, incest, or non-consensual sexual content.`,
    `If a scene approaches a restricted area, steer away gently or fade out rather than hard erroring or dwelling on the boundary.`,
    `Character to preserve: ${JSON.stringify(character ?? {})}`,
  ].join("\n");
  const startModeGuidance =
    startMode === "suggestive"
      ? "Open with a suggestive, teasing energy and a little more charge in the atmosphere."
      : startMode === "explicit"
        ? "Open with direct, high-heat energy, but still stay within platform-safe policy limits."
        : startMode === "dialogue_heavy"
          ? "Open by foregrounding dialogue and character voices."
          : startMode === "slow_burn"
            ? "Open slowly, letting tension accumulate before anything big happens."
            : "Open in a balanced, flexible way that suits the scene.";
  const user = mode === "collaborate"
    ? `Continue the story in a natural way.\n\nOpening mode: ${startMode || "balanced"}. ${startModeGuidance}\n\nStory so far:\n${story}\n\nWriter prompt:\n${prompt}`
    : `Edit the draft for obvious inconsistencies, wording issues, and typos. Return the improved passage only.\n\nOpening mode: ${startMode || "balanced"}. ${startModeGuidance}\n\nDraft:\n${story}\n\nFocus:\n${prompt}`;
  const fullPrompt = `${system}\n\n${user}`;
  const upstream = provider === "anthropic"
    ? await streamAnthropic(apiKey, model, fullPrompt)
    : await streamOpenAI(apiKey, model, fullPrompt);

  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
              const lines = part.split("\n");
              for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                let chunk = "";
                try {
                  const parsed = JSON.parse(data);
                  chunk = provider === "anthropic"
                    ? parsed.type === "content_block_delta"
                      ? parsed.delta?.text ?? ""
                      : ""
                    : parsed.type === "response.output_text.delta"
                      ? parsed.delta ?? ""
                      : "";
                } catch {
                  chunk = "";
                }
                if (chunk) controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
              }
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    }),
    { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } },
  );
}
