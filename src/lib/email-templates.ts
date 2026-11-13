/**
 * Client emails: "your gallery is ready" and "your gallery expires soon". Table-based
 * HTML with inline styles (what every mail client renders the same way), plus a
 * plain-text version. Same restraint as the site: achromatic, a serif title, one
 * black button. Every value that came from a person (titles, messages) is escaped.
 */

const BRAND = "Mosa Mian Photography";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatLongDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

type Layout = {
  preheader: string;
  coverUrl: string | null;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  buttonLabel: string;
  url: string;
  footnote: string | null;
};

/** All arguments are already-escaped HTML except url and coverUrl, escaped here. */
function layout({ preheader, coverUrl, eyebrow, title, paragraphs, buttonLabel, url, footnote }: Layout) {
  const href = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;">
${
  coverUrl
    ? `<tr><td><a href="${href}"><img src="${escapeHtml(coverUrl)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>`
    : ""
}
<tr><td style="padding:40px 40px 8px;font-family:${SANS};">
<p style="margin:0 0 12px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#737373;">${eyebrow}</p>
<h1 style="margin:0 0 20px;font-family:${SERIF};font-size:30px;line-height:1.2;font-weight:normal;color:#171717;">${title}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#404040;">${p}</p>`).join("\n")}
</td></tr>
<tr><td style="padding:12px 40px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#171717;border-radius:4px;">
<a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:14px;letter-spacing:0.5px;color:#ffffff;text-decoration:none;">${buttonLabel}</a>
</td></tr></table>
${footnote ? `<p style="margin:20px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:#737373;">${footnote}</p>` : ""}
</td></tr>
</table>
<p style="margin:20px 0 0;font-family:${SANS};font-size:12px;color:#a3a3a3;">${BRAND}</p>
</td></tr>
</table>
</body>
</html>`;
}

/** A personal message keeps its line breaks; blank lines start a new paragraph. */
function messageParagraphs(message: string) {
  return message
    .trim()
    .split(/\n\s*\n/)
    .map((block) => escapeHtml(block.trim()).replace(/\n/g, "<br>"))
    .filter(Boolean);
}

export function galleryReadyEmail(input: {
  galleryTitle: string;
  url: string;
  coverUrl: string | null;
  message: string | null;
  expiresAt: Date | null;
}) {
  const title = input.galleryTitle.trim() || "Your gallery";
  const expiry = input.expiresAt ? `Your gallery is available until ${formatLongDate(input.expiresAt)}.` : null;
  const intro = "Your photos are ready to view. Favourite the ones you love and download them whenever you like.";
  const message = input.message?.trim() ? input.message.trim() : null;

  const html = layout({
    preheader: escapeHtml(`Your photos from ${title} are ready to view.`),
    coverUrl: input.coverUrl,
    eyebrow: escapeHtml(BRAND),
    title: escapeHtml(title),
    paragraphs: message ? messageParagraphs(message) : [escapeHtml(intro)],
    buttonLabel: "View your gallery",
    url: input.url,
    footnote: expiry ? escapeHtml(expiry) : null,
  });
  const text = [title, "", message ?? intro, "", `View your gallery: ${input.url}`, expiry ? `\n${expiry}` : "", "", BRAND]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { subject: `Your photos are ready: ${title}`, html, text };
}

export function expiryReminderEmail(input: { galleryTitle: string; url: string; coverUrl: string | null; expiresAt: Date }) {
  const title = input.galleryTitle.trim() || "Your gallery";
  const when = formatLongDate(input.expiresAt);
  const body = `Your gallery will no longer be available after ${when}. If you haven't yet, now is a good time to download your favourites.`;

  const html = layout({
    preheader: escapeHtml(`Your gallery ${title} is available until ${when}.`),
    coverUrl: input.coverUrl,
    eyebrow: escapeHtml(BRAND),
    title: escapeHtml(title),
    paragraphs: [escapeHtml(body)],
    buttonLabel: "Open your gallery",
    url: input.url,
    footnote: escapeHtml("Need more time? Just reply to this email."),
  });
  const text = [title, "", body, "", `Open your gallery: ${input.url}`, "", "Need more time? Just reply to this email.", "", BRAND].join(
    "\n",
  );

  return { subject: `Your gallery expires on ${when}: ${title}`, html, text };
}
