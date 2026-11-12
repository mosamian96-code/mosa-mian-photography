import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  open: 0,
  maxOpen: 0,
  requested: [] as string[],
  streams: [] as Readable[],
  endless: false,
}));

vi.mock("@/lib/storage", () => ({
  getObjectStream: vi.fn(async (key: string) => {
    storage.requested.push(key);
    storage.open++;
    storage.maxOpen = Math.max(storage.maxOpen, storage.open);
    let sent = false;
    const stream = new Readable({
      read() {
        if (storage.endless) {
          this.push(Buffer.alloc(64 * 1024, 1));
        } else if (!sent) {
          sent = true;
          this.push(Buffer.from(`contents of ${key}`));
        } else {
          this.push(null);
        }
      },
    });
    stream.once("close", () => storage.open--);
    storage.streams.push(stream);
    return stream;
  }),
}));

vi.mock("@/lib/error-log", () => ({ logError: vi.fn(async () => {}) }));

const { zipResponse } = await import("./zip-download");

async function readAll(res: Response) {
  return Buffer.from(await res.arrayBuffer());
}

beforeEach(() => {
  storage.open = 0;
  storage.maxOpen = 0;
  storage.requested = [];
  storage.streams = [];
  storage.endless = false;
});

describe("zipResponse", () => {
  it("produces a complete zip while holding at most one storage stream open", async () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({ storageKey: `k${i}`, filename: `photo-${i}.jpg` }));
    const zip = await readAll(zipResponse("test", "gallery", entries));

    expect(storage.requested).toHaveLength(60);
    expect(storage.maxOpen).toBe(1);
    expect(storage.open).toBe(0);
    for (let i = 0; i < 60; i++) expect(zip.includes(Buffer.from(`photo-${i}.jpg`))).toBe(true);
    // End-of-central-directory record: present only in a finalized zip.
    expect(zip.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
  });

  it("gives colliding names unique, case-insensitive variants and strips directory parts", async () => {
    const entries = [
      { storageKey: "a", filename: "a.jpg" },
      { storageKey: "b", filename: "A.jpg" },
      { storageKey: "c", filename: "a (1).jpg" },
      { storageKey: "d", filename: "../../evil.jpg" },
    ];
    const zip = (await readAll(zipResponse("test", "gallery", entries))).toString("latin1");

    expect(zip).toContain("A (1).jpg");
    expect(zip).toContain("a (1) (1).jpg");
    expect(zip).toContain("evil.jpg");
    expect(zip).not.toContain("../");
  });

  it("releases the in-flight storage stream and stops fetching when the visitor disconnects", async () => {
    storage.endless = true;
    const entries = Array.from({ length: 50 }, (_, i) => ({ storageKey: `k${i}`, filename: `p${i}.jpg` }));
    const res = zipResponse("test", "gallery", entries);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 50));

    expect(storage.requested).toHaveLength(1);
    expect(storage.open).toBe(0);
  });

  it("sanitizes the download filename", () => {
    const res = zipResponse("test", 'evil"\r\nname', []);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="evil_name.zip"');
  });
});
