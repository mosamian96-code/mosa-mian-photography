import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("keeps the base letter of Swedish characters", () => {
    expect(slugify("Öland")).toBe("oland");
    expect(slugify("Öland Christmas Market")).toBe("oland-christmas-market");
    expect(slugify("Gärdet & Åre")).toBe("gardet-are");
  });

  it("spells out letters that have no accent to strip", () => {
    expect(slugify("Øresund")).toBe("oresund");
    expect(slugify("Straße")).toBe("strasse");
    expect(slugify("Łódź")).toBe("lodz");
  });

  it("collapses punctuation and trims dashes", () => {
    expect(slugify("  Valborg 2024!  ")).toBe("valborg-2024");
    expect(slugify("Mosa's \"best\" shots")).toBe("mosas-best-shots");
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("untitled");
    expect(slugify("")).toBe("untitled");
  });
});
