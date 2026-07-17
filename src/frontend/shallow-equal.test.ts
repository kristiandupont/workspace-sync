import { describe, expect, it } from "vitest";

import { shallowEqual } from "./shallow-equal";

describe("shallowEqual", () => {
  it("treats identical references as equal", () => {
    const value = { a: 1 };
    expect(shallowEqual(value, value)).toBe(true);
  });

  it("treats objects with the same own properties as equal", () => {
    expect(shallowEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
  });

  it("treats a differing property as unequal", () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("treats an extra property as unequal", () => {
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("does not recurse into nested objects", () => {
    expect(shallowEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(false);
  });

  it("compares arrays element-wise", () => {
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual([1, 2], [1, 3])).toBe(false);
  });

  it("compares primitives", () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual(1, 2)).toBe(false);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(null, {})).toBe(false);
  });
});
