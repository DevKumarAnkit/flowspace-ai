export const ASSEMBLYAI_SAMPLE_RATE = 16_000;
export const ASSEMBLYAI_CHUNK_SAMPLES = 800;
export const ASSEMBLYAI_SESSION_LIMIT_MS = 120_000;

export type AssemblyAIMessage =
  | { type: "Begin"; id: string; expiresAt?: number }
  | { type: "Turn"; turnOrder: number; transcript: string; endOfTurn: boolean }
  | { type: "Termination"; audioDurationSeconds?: number; sessionDurationSeconds?: number };

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseAssemblyAIMessage(raw: string): AssemblyAIMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.type === "Begin" && typeof message.id === "string") {
    return { type: "Begin", id: message.id, expiresAt: finiteNumber(message.expires_at) };
  }
  if (message.type === "Turn" && Number.isInteger(message.turn_order) && typeof message.transcript === "string") {
    return {
      type: "Turn",
      turnOrder: message.turn_order as number,
      transcript: message.transcript,
      endOfTurn: message.end_of_turn === true,
    };
  }
  if (message.type === "Termination") {
    return {
      type: "Termination",
      audioDurationSeconds: finiteNumber(message.audio_duration_seconds),
      sessionDurationSeconds: finiteNumber(message.session_duration_seconds),
    };
  }
  return null;
}

const OPENING_BOUNDARY = /[\s([{\u201c\u2018]$/u;
const CLOSING_BOUNDARY = /^[\s,.;:!?)}\]\u201d\u2019]/u;

export function transcriptWithBoundarySpacing(transcript: string, before = "", after = "") {
  const text = transcript.trim();
  if (!text) return "";
  const prefix = before && !OPENING_BOUNDARY.test(before) && !CLOSING_BOUNDARY.test(text) ? " " : "";
  const suffix = after && !OPENING_BOUNDARY.test(text) && !CLOSING_BOUNDARY.test(after) ? " " : "";
  return `${prefix}${text}${suffix}`;
}

export function floatToPcm16(samples: Float32Array) {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    pcm[index] = sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767);
  }
  return pcm;
}

export function resampleLinear(samples: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate <= 0 || outputRate <= 0) throw new Error("Audio sample rates must be positive.");
  if (inputRate === outputRate) return samples.slice();
  const outputLength = Math.max(1, Math.floor(samples.length * outputRate / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = inputRate / outputRate;
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, samples.length - 1);
    const mix = sourceIndex - left;
    output[index] = (samples[left] ?? 0) * (1 - mix) + (samples[right] ?? 0) * mix;
  }
  return output;
}
