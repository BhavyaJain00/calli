// Call summaries, sentiment and action items with Claude.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const CallInsightSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  keywords: z.array(z.string()),
  action_items: z.array(z.string()),
});

export type CallInsight = z.infer<typeof CallInsightSchema>;

const SYSTEM_PROMPT = `You review recorded phone calls for a sales team's call dashboard.
Managers and agents read your output to catch up on a call without listening to it.

Return:
- summary: 1-3 sentences on who called, what was discussed and how it ended.
- sentiment: the customer's overall sentiment by the end of the call.
- keywords: up to 6 short topic tags (products, objections, competitors, pricing...).
- action_items: concrete follow-ups that were promised or are clearly needed, each
  starting with a verb. Use an empty list if there are none.

The transcript is machine-generated and may contain recognition errors. Base
everything on what was actually said; don't invent names, numbers or commitments.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment.
  client ??= new Anthropic();
  return client;
}

export function summaryConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function summarizeTranscript(transcript: string): Promise<CallInsight> {
  const response = await getClient().beta.messages.parse({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    // Summaries don't need deep reasoning; low effort keeps them fast and cheap.
    output_config: { effort: "low", format: zodOutputFormat(CallInsightSchema) },
    // If a safety classifier declines, Anthropic re-runs the request on its
    // recommended fallback model instead of returning a refusal.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<transcript>\n${transcript}\n</transcript>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI model declined to summarise this call");
  }
  if (!response.parsed_output) {
    throw new Error(`The AI summary could not be parsed (stop reason: ${response.stop_reason})`);
  }

  const out = response.parsed_output;
  return {
    summary: out.summary.trim(),
    sentiment: out.sentiment,
    keywords: out.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 6),
    action_items: out.action_items.map((a) => a.trim()).filter(Boolean),
  };
}
