import { describe, expect, it } from "vitest";
import { getPrevNext, sortDocsNav } from "../../src/lib/docs-nav";

describe("sortDocsNav", () => {
  it("sorts by order ascending", () => {
    const pages = [
      { id: "c", data: { order: 3 } },
      { id: "a", data: { order: 1 } },
      { id: "b", data: { order: 2 } },
    ];
    expect(sortDocsNav(pages).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties on duplicate order by id ascending", () => {
    const pages = [
      { id: "zebra", data: { order: 1 } },
      { id: "apple", data: { order: 1 } },
    ];
    expect(sortDocsNav(pages).map((p) => p.id)).toEqual(["apple", "zebra"]);
  });

  it("does not mutate the input array", () => {
    const pages = [
      { id: "b", data: { order: 2 } },
      { id: "a", data: { order: 1 } },
    ];
    sortDocsNav(pages);
    expect(pages.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("getPrevNext", () => {
  const sorted = [
    { id: "a", data: { order: 1 } },
    { id: "b", data: { order: 2 } },
    { id: "c", data: { order: 3 } },
  ];

  it("returns null for both when there is only one page", () => {
    const single = [{ id: "only", data: { order: 1 } }];
    expect(getPrevNext(single, "only")).toEqual({ prev: null, next: null });
  });

  it("returns null prev and a next for the first page", () => {
    expect(getPrevNext(sorted, "a")).toEqual({ prev: null, next: sorted[1] });
  });

  it("returns a prev and a next for a middle page", () => {
    expect(getPrevNext(sorted, "b")).toEqual({
      prev: sorted[0],
      next: sorted[2],
    });
  });

  it("returns a prev and null next for the last page", () => {
    expect(getPrevNext(sorted, "c")).toEqual({ prev: sorted[1], next: null });
  });

  it("returns null for both when currentId is not found", () => {
    expect(getPrevNext(sorted, "missing")).toEqual({ prev: null, next: null });
  });
});
