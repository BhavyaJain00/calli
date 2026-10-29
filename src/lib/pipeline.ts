import { prisma } from "./db";
import { extensionForMime, readRecording } from "./storage";
import { transcribeAudio, transcriptionConfigured } from "./transcribe";
import { summarizeTranscript, summaryConfigured } from "./summarize";

// Transcribes and summarises one call, persisting the results.
// Calls without a recording (e.g. missed calls) are simply marked complete.
// Nothing is ever fabricated: if a provider isn't configured the step is
// skipped and the reason is recorded on the call.
export async function processCall(callId: string): Promise<void> {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) return;

  if (!call.recordingPath) {
    await prisma.call.update({
      where: { id: callId },
      data: { status: "COMPLETED", aiError: null },
    });
    return;
  }

  if (!transcriptionConfigured()) {
    await prisma.$transaction([
      prisma.transcript.upsert({
        where: { callId },
        create: { callId, status: "SKIPPED" },
        update: { status: "SKIPPED", text: "" },
      }),
      prisma.call.update({
        where: { id: callId },
        data: {
          status: "COMPLETED",
          aiError: "Transcription is not configured on the server (OPENAI_API_KEY).",
        },
      }),
    ]);
    return;
  }

  await prisma.$transaction([
    prisma.call.update({
      where: { id: callId },
      data: { status: "TRANSCRIBING", aiError: null },
    }),
    prisma.transcript.upsert({
      where: { callId },
      create: { callId, status: "PENDING" },
      update: { status: "PENDING" },
    }),
  ]);

  // 1) Speech to text
  let text: string;
  try {
    const buffer = await readRecording(call.recordingPath);
    if (!buffer) throw new Error("Recording file could not be read from storage");
    const mime = call.recordingMime || "audio/mpeg";
    const result = await transcribeAudio({
      buffer,
      mimeType: mime,
      filename: `${callId}.${extensionForMime(mime)}`,
    });
    text = result.text;
    await prisma.transcript.update({
      where: { callId },
      data: {
        text: result.text,
        language: result.language,
        provider: result.provider,
        status: "DONE",
      },
    });
  } catch (err) {
    console.error(`[pipeline] transcription failed for call ${callId}:`, err);
    await prisma.$transaction([
      prisma.transcript.update({ where: { callId }, data: { status: "FAILED" } }),
      prisma.call.update({
        where: { id: callId },
        data: { status: "FAILED", aiError: errorMessage(err) },
      }),
    ]);
    return;
  }

  // 2) Summary, sentiment, action items
  if (!text) {
    await prisma.call.update({
      where: { id: callId },
      data: { status: "COMPLETED", aiError: "No speech was detected in the recording." },
    });
    return;
  }
  if (!summaryConfigured()) {
    await prisma.call.update({
      where: { id: callId },
      data: {
        status: "COMPLETED",
        aiError: "AI summaries are not configured on the server (ANTHROPIC_API_KEY).",
      },
    });
    return;
  }

  try {
    const insight = await summarizeTranscript(text);
    await prisma.call.update({
      where: { id: callId },
      data: {
        status: "COMPLETED",
        summary: insight.summary,
        sentiment: insight.sentiment,
        keywords: insight.keywords.join(", "),
        actionItems: JSON.stringify(insight.action_items),
        aiError: null,
      },
    });
  } catch (err) {
    console.error(`[pipeline] summary failed for call ${callId}:`, err);
    // The transcript is still useful, so the call is complete without a summary.
    await prisma.call.update({
      where: { id: callId },
      data: { status: "COMPLETED", aiError: `Summary failed: ${errorMessage(err)}` },
    });
  }
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}
