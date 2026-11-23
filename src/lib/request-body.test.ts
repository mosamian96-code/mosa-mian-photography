import { describe, expect, it } from "vitest";
import {
  nullableDate,
  optionalBoolean,
  optionalEnum,
  optionalInteger,
  requiredString,
  stringArray,
  withJsonBody,
} from "./request-body";

function jsonRequest(body: string) {
  return new Request("http://localhost/test", { method: "POST", body, headers: { "content-type": "application/json" } });
}

describe("withJsonBody", () => {
  it("answers 400 for malformed JSON", async () => {
    const res = await withJsonBody(jsonRequest("{not json"), async () => new Response("unreachable"));
    expect(res.status).toBe(400);
  });

  it("answers 400 for a JSON array or string", async () => {
    expect((await withJsonBody(jsonRequest("[1,2]"), async () => new Response("x"))).status).toBe(400);
    expect((await withJsonBody(jsonRequest('"hi"'), async () => new Response("x"))).status).toBe(400);
  });

  it("turns a field error into a 400 with its message", async () => {
    const res = await withJsonBody(jsonRequest('{"name": 5}'), async (body) => {
      requiredString(body, "name");
      return new Response("unreachable");
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name must be a string" });
  });

  it("passes a valid body through", async () => {
    const res = await withJsonBody(jsonRequest('{"name": " Mosa "}'), async (body) => new Response(requiredString(body, "name")));
    expect(await res.text()).toBe("Mosa");
  });
});

describe("field readers", () => {
  it("rejects too-long strings", () => {
    expect(() => requiredString({ a: "abcdef" }, "a", { max: 3 })).toThrow("at most 3");
  });

  it("checks enums, booleans and integers", () => {
    expect(optionalEnum({ v: "web" }, "v", ["off", "web"] as const)).toBe("web");
    expect(() => optionalEnum({ v: "all" }, "v", ["off", "web"] as const)).toThrow();
    expect(() => optionalBoolean({ b: "true" }, "b")).toThrow();
    expect(optionalInteger({ n: 3 }, "n")).toBe(3);
    expect(() => optionalInteger({ n: 1.5 }, "n")).toThrow();
  });

  it("parses dates and keeps null as clear", () => {
    expect(nullableDate({ d: null }, "d")).toBeNull();
    expect(nullableDate({ d: "2026-12-01" }, "d")?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(() => nullableDate({ d: "soon" }, "d")).toThrow();
  });

  it("caps id lists", () => {
    expect(stringArray({ ids: ["a", "b"] }, "ids")).toEqual(["a", "b"]);
    expect(() => stringArray({ ids: [] }, "ids")).toThrow();
    expect(() => stringArray({ ids: ["a", 2] }, "ids")).toThrow();
    expect(() => stringArray({ ids: ["a", "b", "c"] }, "ids", 2)).toThrow();
  });
});
