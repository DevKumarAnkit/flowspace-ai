import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanWhiteboardName, EMPTY_WHITEBOARD_SCENE, formatWhiteboardTime, normalizeDiagramGrid,
  safePngFilename, validateAiDiagram, validWhiteboardScene,
} from "./whiteboard-domain.ts";

const diagram = {
  title: "Checkout",
  nodes: [
    { id: "start", label: "Start", shape: "ellipse", row: 2, column: 3, color: "#ECE8FF" },
    { id: "pay", label: "Pay", shape: "rectangle", row: 2, column: 3, color: "#DDEBFF" },
  ],
  edges: [{ from: "start", to: "pay", style: "solid" }],
};

test("validates names and safe PNG filenames", () => {
  assert.equal(cleanWhiteboardName("  Roadmap  "), "Roadmap");
  assert.throws(() => cleanWhiteboardName(" "));
  assert.equal(safePngFilename(' Roadmap: Q3 / launch. '), "Roadmap Q3 launch.png");
});

test("validates an empty persisted scene", () => {
  assert.deepEqual(validWhiteboardScene(EMPTY_WHITEBOARD_SCENE), EMPTY_WHITEBOARD_SCENE);
  assert.throws(() => validWhiteboardScene({ elements: [] }));
});

test("rejects oversized embedded images and scenes", () => {
  const oversizedImage = `data:image/png;base64,${"A".repeat(Math.ceil((5 * 1024 * 1024) / 0.75) + 8)}`;
  assert.throws(() => validWhiteboardScene({ elements: [], appState: {}, files: { image: { dataURL: oversizedImage } } }), /5 MB/);
  assert.throws(() => validWhiteboardScene({ elements: [{ text: "x".repeat(10 * 1024 * 1024) }], appState: {}, files: {} }), /10 MB/);
});

test("formats recent whiteboard times", () => {
  const now = new Date("2026-07-20T12:00:00Z");
  assert.equal(formatWhiteboardTime("2026-07-20T11:59:40Z", now), "Just now");
  assert.equal(formatWhiteboardTime("2026-07-20T11:40:00Z", now), "20m ago");
  assert.equal(formatWhiteboardTime("2026-07-20T09:00:00Z", now), "3h ago");
});

test("validates and normalizes generated diagrams without overlaps", () => {
  const valid = validateAiDiagram(diagram);
  const normalized = normalizeDiagramGrid(valid);
  assert.deepEqual(normalized.nodes.map(({ row, column }) => [row, column]), [[0, 0], [0, 1]]);
});

test("rejects duplicate nodes and dangling edges", () => {
  assert.throws(() => validateAiDiagram({ ...diagram, nodes: [diagram.nodes[0], diagram.nodes[0]] }));
  assert.throws(() => validateAiDiagram({ ...diagram, edges: [{ from: "start", to: "missing", style: "solid" }] }));
});
