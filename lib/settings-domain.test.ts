import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings, resolveAiModel, validateCategory, validateSettingsPatch } from "./settings-domain.ts";

test("settings use safe defaults and merge boolean groups", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.equal(normalizeSettings({ notifications: { ...DEFAULT_SETTINGS.notifications, productUpdates: true } }).notifications.productUpdates, true);
});

test("settings patches reject unsupported enum values", () => {
  assert.equal(validateSettingsPatch({ theme: "dark" }).theme, "dark");
  assert.throws(() => validateSettingsPatch({ aiModel: "made-up-model" }), /valid AI model/);
  assert.equal(resolveAiModel("made-up-model"), "gemini-3.5-flash");
});

test("categories validate scope, color, icon, and name", () => {
  assert.equal(validateCategory({ name: " Work ", color: "#7057E8", icon: "briefcase", scope: "task" }).name, "Work");
  assert.throws(() => validateCategory({ name: "", color: "#7057E8", icon: "tag", scope: "note" }), /category name/);
  assert.throws(() => validateCategory({ name: "Work", color: "pink", icon: "tag", scope: "note" }), /category color/);
  assert.throws(() => validateCategory({ name: "Work", color: "#7057E8", icon: "unknown", scope: "note" }), /category icon/);
  assert.throws(() => validateCategory({ name: "Work", color: "#7057E8", icon: "tag", scope: "unknown" }), /category type/);
});
