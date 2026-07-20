import { describe, expect, it } from "vitest";
import {
  firstEnabledIndex,
  lastEnabledIndex,
  moveEnabledIndex,
  selectedOrFirstEnabledIndex,
} from "../../src/renderer/src/ui/custom-select-model";

const options = [
  { disabled: true },
  { disabled: false },
  { disabled: true },
  {},
];

describe("custom select navigation", () => {
  it("finds boundary enabled options", () => {
    expect(firstEnabledIndex(options)).toBe(1);
    expect(lastEnabledIndex(options)).toBe(3);
    expect(firstEnabledIndex([{ disabled: true }])).toBe(-1);
    expect(lastEnabledIndex([{ disabled: true }])).toBe(-1);
    expect(lastEnabledIndex([])).toBe(-1);
  });

  it("keeps an enabled selection and reconciles invalid selections", () => {
    expect(selectedOrFirstEnabledIndex(options, 3)).toBe(3);
    expect(selectedOrFirstEnabledIndex(options, 0)).toBe(1);
    expect(selectedOrFirstEnabledIndex(options, -1)).toBe(1);
  });

  it("reconciles an out-of-range active index after options change", () => {
    expect(selectedOrFirstEnabledIndex([{}, { disabled: true }], 3)).toBe(0);
    expect(selectedOrFirstEnabledIndex([], 3)).toBe(-1);
  });

  it("moves through enabled options and wraps", () => {
    expect(moveEnabledIndex(options, 1, 1)).toBe(3);
    expect(moveEnabledIndex(options, 3, 1)).toBe(1);
    expect(moveEnabledIndex(options, 3, -1)).toBe(1);
    expect(moveEnabledIndex(options, 1, -1)).toBe(3);
  });

  it("moves from invalid boundary indexes in either direction", () => {
    expect(moveEnabledIndex(options, -1, 1)).toBe(1);
    expect(moveEnabledIndex(options, options.length, -1)).toBe(3);
  });

  it("returns -1 when no option is enabled", () => {
    const disabled = [{ disabled: true }, { disabled: true }];
    expect(selectedOrFirstEnabledIndex(disabled, 0)).toBe(-1);
    expect(moveEnabledIndex(disabled, -1, 1)).toBe(-1);
  });
});
