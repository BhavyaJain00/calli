// Speech-to-text for call recordings via OpenAI's transcription API.
// (Claude does not transcribe audio, so this step uses a dedicated STT model;
// the Claude summary step lives in ./summarize.ts.)

export type TranscriptionResult = {
  text: string;
  language: string | null;
  provider: string;
};

// OpenAI's transcription endpoint rejects files larger than 25 MB.
export const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function transcribeAudio(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  if (input.buffer.length > TRANSCRIBE_MAX_BYTES) {
    throw new Error("Recording is larger than the 25 MB transcription limit");
  }

  const model = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
  const form = new FormData();
  // Copy into a plain ArrayBuffer-backed view; newer Node typings reject a
  // Buffer (which may be SharedArrayBuffer-backed) as a BlobPart.
  form.append(
    "file",
    new Blob([Uint8Array.from(input.buffer)], { type: input.mimeType }),
    input.filename
  );
  form.append("model", model);
  // whisper-1 can report the detected language; newer models return text only.
  form.append("response_format", model.startsWith("whisper") ? "verbose_json" : "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Transcription failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as { text?: string; language?: string };
  return {
    text: (data.text ?? "").trim(),
    language: data.language ?? null,
    provider: `openai:${model}`,
  };
}
