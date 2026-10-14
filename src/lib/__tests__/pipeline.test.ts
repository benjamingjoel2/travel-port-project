import { describe, expect, it } from "vitest";
import { orderStagesForBoard, stageMoveBlockedReason } from "@/lib/pipeline";

describe("stageMoveBlockedReason", () => {
  it("allows ungated stages regardless of checklist", () => {
    expect(stageMoveBlockedReason({ name: "Building", requiresChecklist: false }, ["Domain bought"])).toBeNull();
  });
  it("allows gated stages when nothing is missing", () => {
    expect(stageMoveBlockedReason({ name: "Live", requiresChecklist: true }, [])).toBeNull();
  });
  it("blocks gated stages and counts what is missing", () => {
    expect(stageMoveBlockedReason({ name: "Live", requiresChecklist: true }, ["a", "b"])).toMatch(/2 required checklist items/);
    expect(stageMoveBlockedReason({ name: "Live", requiresChecklist: true }, ["a"])).toMatch(/1 required checklist item still/);
  });
});

describe("orderStagesForBoard", () => {
  it("keeps stage order but pushes paused/dropped to the end", () => {
    const out = orderStagesForBoard([
      { sortOrder: 90, isTerminal: true },
      { sortOrder: 20, isTerminal: false },
      { sortOrder: 10, isTerminal: false },
      { sortOrder: 100, isTerminal: true },
    ]);
    expect(out.map((s) => s.sortOrder)).toEqual([10, 20, 90, 100]);
  });
});
