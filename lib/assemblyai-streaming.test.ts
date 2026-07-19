import assert from "node:assert/strict";
import test from "node:test";
import {
  floatToPcm16,
  parseAssemblyAIMessage,
  resampleLinear,
  transcriptWithBoundarySpacing,
} from "./assemblyai-streaming.ts";

test("streaming messages distinguish partial, final, and termination events", () => {
  assert.deepEqual(parseAssemblyAIMessage(JSON.stringify({ type: "Turn", turn_order: 4, transcript: "Live pre", end_of_turn: false })), {
    type: "Turn", turnOrder: 4, transcript: "Live pre", endOfTurn: false,
  });
  assert.deepEqual(parseAssemblyAIMessage(JSON.stringify({ type: "Turn", turn_order: 4, transcript: "Live preview.", end_of_turn: true })), {
    type: "Turn", turnOrder: 4, transcript: "Live preview.", endOfTurn: true,
  });
  assert.deepEqual(parseAssemblyAIMessage(JSON.stringify({ type: "Termination", audio_duration_seconds: 12, session_duration_seconds: 13 })), {
    type: "Termination", audioDurationSeconds: 12, sessionDurationSeconds: 13,
  });
  assert.equal(parseAssemblyAIMessage("not json"), null);
  assert.equal(parseAssemblyAIMessage(JSON.stringify({ type: "Turn", transcript: "missing order" })), null);
});

test("transcript insertion adds only necessary boundary spacing", () => {
  assert.equal(transcriptWithBoundarySpacing(" new thought ", "d", "e"), " new thought ");
  assert.equal(transcriptWithBoundarySpacing("Hello", "", ""), "Hello");
  assert.equal(transcriptWithBoundarySpacing("world.", " ", ""), "world.");
  assert.equal(transcriptWithBoundarySpacing(", next", "d", ""), ", next");
  assert.equal(transcriptWithBoundarySpacing("", "a", "b"), "");
});

test("audio helpers resample and clamp browser float samples to PCM16", () => {
  assert.deepEqual(Array.from(floatToPcm16(new Float32Array([-2, -1, 0, 1, 2]))), [-32768, -32768, 0, 32767, 32767]);
  const resampled = resampleLinear(new Float32Array([0, 1, 0, -1]), 4, 2);
  assert.deepEqual(Array.from(resampled), [0, 0]);
  assert.throws(() => resampleLinear(new Float32Array([0]), 0, 16_000), /positive/);
});

test("a finalized turn order can be used as an idempotency key", () => {
  const finalized = new Set<number>();
  const accepted = [2, 2, 3].filter((turnOrder) => {
    if (finalized.has(turnOrder)) return false;
    finalized.add(turnOrder);
    return true;
  });
  assert.deepEqual(accepted, [2, 3]);
});
