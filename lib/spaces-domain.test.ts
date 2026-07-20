import assert from "node:assert/strict";
import test from "node:test";
import { cleanPageTitle, cleanSpaceDescription, cleanSpaceName, duplicateName, extractPageExcerpt, filterSpaces, formatRelativeTime, sortSpaces, templateDocument, validPageDocument, validPageTemplate, validSpaceColor, type SpaceSummary } from "./spaces-domain.ts";

const owner = { id: 1, name: "Alex", email: "alex@example.com", imageUrl: null };
const sample = (values: Partial<SpaceSummary> & Pick<SpaceSummary, "id" | "name">): SpaceSummary => {
  const { id, name, ...rest } = values;
  return { id, name, description: "", color: "#7057E8", isFavorite: false, lastOpenedAt: null, archivedAt: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z", pageCount: 0, pageTitles: [], owner, accessRole: "owner", ...rest };
};

test("space and page fields are validated", () => {
  assert.equal(cleanSpaceName("  Work  "), "Work");
  assert.equal(cleanSpaceDescription("  Details  "), "Details");
  assert.equal(cleanPageTitle("  Roadmap  "), "Roadmap");
  assert.throws(() => cleanSpaceName(""), /space name/);
  assert.throws(() => cleanSpaceDescription("x".repeat(501)), /500/);
  assert.throws(() => cleanPageTitle("x".repeat(161)), /page name/);
  assert.equal(validSpaceColor("#7057E8"), "#7057E8");
  assert.equal(validPageTemplate("prd"), "prd");
  assert.throws(() => validPageTemplate("unknown"), /template/);
  assert.deepEqual(validPageDocument({ type: "doc", content: [] }), { type: "doc", content: [] });
});

test("templates and excerpts contain useful persisted content", () => {
  assert.equal(templateDocument("blank").type, "doc");
  const prd = templateDocument("prd");
  assert.match(extractPageExcerpt(prd), /Problem/);
  assert.equal(extractPageExcerpt({ type: "doc", content: [{ type: "paragraph" }] }), "No description yet.");
  assert.equal(extractPageExcerpt({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "abcdef" }] }] }, 5), "abcd…");
});

test("space filters search page titles without returning page rows", () => {
  const entries = [sample({ id: 1, name: "Work", pageTitles: ["Q2 Roadmap"], isFavorite: true }), sample({ id: 2, name: "Archive", archivedAt: "2026-07-19T00:00:00.000Z" })];
  assert.deepEqual(filterSpaces(entries, "all", "roadmap").map((entry) => entry.id), [1]);
  assert.deepEqual(filterSpaces(entries, "favorites").map((entry) => entry.id), [1]);
  assert.deepEqual(filterSpaces(entries, "archived").map((entry) => entry.id), [2]);
});

test("space sorting supports name, pages, favorites, and updated", () => {
  const entries = [sample({ id: 1, name: "Zulu", pageCount: 2, updatedAt: "2026-07-18T00:00:00.000Z" }), sample({ id: 2, name: "Alpha", pageCount: 8, isFavorite: true, updatedAt: "2026-07-19T00:00:00.000Z" })];
  assert.deepEqual(sortSpaces(entries, "name").map((entry) => entry.id), [2, 1]);
  assert.deepEqual(sortSpaces(entries, "pages").map((entry) => entry.id), [2, 1]);
  assert.deepEqual(sortSpaces(entries, "favorites").map((entry) => entry.id), [2, 1]);
  assert.deepEqual(sortSpaces(entries, "updated").map((entry) => entry.id), [2, 1]);
});

test("duplicate names remain within limits and relative time is readable", () => {
  assert.equal(duplicateName("Roadmap"), "Roadmap Copy");
  assert.equal(duplicateName("x".repeat(160)).length, 160);
  const now = new Date("2026-07-20T12:00:00.000Z");
  assert.equal(formatRelativeTime("2026-07-20T11:59:45.000Z", now), "just now");
  assert.equal(formatRelativeTime("2026-07-19T12:00:00.000Z", now), "yesterday");
});
