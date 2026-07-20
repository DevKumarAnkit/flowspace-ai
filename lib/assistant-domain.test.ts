import assert from "node:assert/strict";
import test from "node:test";
import { parseAssistantResponse, validateAssistantAction, validateAssistantPrompt } from "./assistant-domain.ts";

test("assistant prompts and action proposals are validated", () => {
  assert.equal(validateAssistantPrompt("  Plan my week  "), "Plan my week");
  assert.throws(() => validateAssistantPrompt(""), /1 and 4,000/);
  assert.deepEqual(validateAssistantAction({ type: "create_note", summary: "Create project notes", payload: { title: "Project" } }).type, "create_note");
  assert.throws(() => validateAssistantAction({ type: "delete_everything", summary: "No", payload: {} }), /Unsupported/);
});

test("assistant structured replies include optional actions", () => {
  assert.equal(parseAssistantResponse('{"message":"What time should it be?"}').message, "What time should it be?");
  assert.equal(parseAssistantResponse('{"message":"Ready to create it.","action":{"type":"create_note","summary":"Create note","payload":{"title":"Ideas"}}}').action?.type, "create_note");
});
