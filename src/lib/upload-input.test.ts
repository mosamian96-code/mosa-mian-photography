import { describe, expect, it } from "vitest";
import { originalKey } from "./storage";
import { isOriginalKey, isSha256 } from "./upload-input";

const HASH = "a".repeat(64);

describe("upload input checks", () => {
  it("accepts only 64-character hex hashes", () => {
    expect(isSha256(HASH)).toBe(true);
    expect(isSha256("A".repeat(64))).toBe(false);
    expect(isSha256("../" + "a".repeat(61))).toBe(false);
  });

  it("accepts the keys originalKey makes and nothing else", () => {
    expect(isOriginalKey(originalKey(HASH, "CR3"))).toBe(true);
    expect(isOriginalKey(`derivatives/${HASH}/1200.webp`)).toBe(false);
    expect(isOriginalKey(`originals/2026/11/${HASH}.jp/g`)).toBe(false);
    expect(isOriginalKey(`originals/2026/11/${HASH}`)).toBe(false);
  });
});
