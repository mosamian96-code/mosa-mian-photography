import { describe, expect, it } from "vitest";
import { escapeHtml, expiryReminderEmail, formatLongDate, galleryReadyEmail } from "./email-templates";

const base = {
  galleryTitle: "Ayesha & Bilal",
  url: "https://example.com/g/abc123",
  coverUrl: "https://cdn.example.com/cover.jpg",
  message: null,
  expiresAt: null,
};

describe("escapeHtml", () => {
  it("escapes every character that could open a tag or break an attribute", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

describe("formatLongDate", () => {
  it("formats in UTC, so a link's last day doesn't shift with the server's zone", () => {
    expect(formatLongDate(new Date("2026-12-01T23:59:59.999Z"))).toBe("1 December 2026");
  });
});

describe("galleryReadyEmail", () => {
  it("links the gallery from the button and the cover, with a plain-text version", () => {
    const email = galleryReadyEmail(base);
    expect(email.subject).toBe("Your photos are ready: Ayesha & Bilal");
    expect(email.html).toContain('href="https://example.com/g/abc123"');
    expect(email.html).toContain('src="https://cdn.example.com/cover.jpg"');
    expect(email.html).toContain("View your gallery");
    expect(email.text).toContain("View your gallery: https://example.com/g/abc123");
  });

  it("escapes the title and the personal message", () => {
    const email = galleryReadyEmail({
      ...base,
      galleryTitle: "<script>alert(1)</script>",
      message: "Hi <b>both</b>,\nhere they are.\n\nEnjoy!",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("Hi &lt;b&gt;both&lt;/b&gt;,<br>here they are.");
    expect(email.html).toContain(">Enjoy!</p>");
  });

  it("uses the standard introduction without a message, and leaves out the cover without one", () => {
    const email = galleryReadyEmail({ ...base, coverUrl: null, message: "   " });
    expect(email.html).toContain("Your photos are ready to view.");
    expect(email.html).not.toContain("<img");
  });

  it("states the expiry date when the link has one", () => {
    const email = galleryReadyEmail({ ...base, expiresAt: new Date("2026-12-01T23:59:59.999Z") });
    expect(email.html).toContain("available until 1 December 2026");
    expect(email.text).toContain("available until 1 December 2026");
  });
});

describe("expiryReminderEmail", () => {
  it("names the last day in the subject and the body", () => {
    const email = expiryReminderEmail({ ...base, expiresAt: new Date("2026-12-01T23:59:59.999Z") });
    expect(email.subject).toBe("Your gallery expires on 1 December 2026: Ayesha & Bilal");
    expect(email.html).toContain("after 1 December 2026");
    expect(email.html).toContain("Ayesha &amp; Bilal");
    expect(email.text).toContain("Open your gallery: https://example.com/g/abc123");
  });
});
