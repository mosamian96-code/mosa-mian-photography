import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logError = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/error-log", () => ({ logError }));

const { POST } = await import("./route");

function post(body: string) {
  return POST(new NextRequest("https://example.com/api/csp-report", { method: "POST", body }));
}

const logged = () => logError.mock.calls.map((call) => (call as unknown[])[1] as Error).map((e) => e.message);

beforeEach(() => logError.mockClear());

describe("POST /api/csp-report", () => {
  it("logs a report-uri (legacy) report", async () => {
    const res = await post(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://site/studio/upload",
          "effective-directive": "connect-src",
          "blocked-uri": "https://s3.example.com/bucket/key?X-Amz-Signature=secret",
        },
      }),
    );
    expect(res.status).toBe(204);
    expect(logged()).toEqual(["connect-src blocked https://s3.example.com/bucket/key on https://site/studio/upload"]);
  });

  it("logs a Reporting API report and ignores other report types", async () => {
    await post(
      JSON.stringify([
        { type: "deprecation", body: { id: "x" } },
        {
          type: "csp-violation",
          body: { documentURL: "https://site/", effectiveDirective: "img-src", blockedURL: "https://other.example/a.png" },
        },
      ]),
    );
    expect(logged()).toEqual(["img-src blocked https://other.example/a.png on https://site/"]);
  });

  it("drops violations caused by browser extensions", async () => {
    await post(
      JSON.stringify({
        "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "inline", "source-file": "chrome-extension://abc/x.js" },
      }),
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it("logs a repeated violation only once", async () => {
    const report = JSON.stringify({ "csp-report": { "effective-directive": "frame-src", "blocked-uri": "https://repeat.example" } });
    await post(report);
    await post(report);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed and oversized bodies without logging", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post("x".repeat(20_000))).status).toBe(413);
    expect(logError).not.toHaveBeenCalled();
  });
});
