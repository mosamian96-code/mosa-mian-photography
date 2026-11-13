import { and, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientAccess, galleries } from "@/lib/db/schema";
import { EmailError, photographerReplyTo, sendEmail } from "@/lib/email";
import { expiryReminderEmail, galleryReadyEmail } from "@/lib/email-templates";
import { logError } from "@/lib/error-log";
import { pickCoverImage } from "@/lib/public-site/gallery-cover";
import { loadGalleryImages } from "@/lib/public-site/resolve";

type Link = typeof clientAccess.$inferSelect;
type Gallery = typeof galleries.$inferSelect;

/** Sent this long before a link expires (see sendDueExpiryReminders). */
export const EXPIRY_REMINDER_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

export function clientLinkUrl(token: string) {
  const base = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/g/${token}`;
}

/** The gallery's cover as a JPEG (mail clients' one universally supported format) --
 * watermarked when the gallery is, since loadGalleryImages only returns the versions
 * the gallery shows. */
async function coverJpegUrl(gallery: Gallery) {
  const cover = pickCoverImage(await loadGalleryImages(gallery), gallery.coverAssetId);
  return cover?.urls.jpeg2560 ?? cover?.urls.jpeg1200 ?? null;
}

/** Emails a client their gallery link and records it on the link. The link takes the
 * recipient as its client email if it has none yet, so the gallery doesn't ask them
 * for an address they were just emailed at. Throws EmailError if Resend refuses. */
export async function sendGalleryReadyEmail(link: Link, gallery: Gallery, to: string, message: string | null) {
  const email = galleryReadyEmail({
    galleryTitle: gallery.title,
    url: clientLinkUrl(link.token),
    coverUrl: await coverJpegUrl(gallery),
    message,
    expiresAt: link.expiresAt,
  });
  await sendEmail({ to, ...email, replyTo: photographerReplyTo() });

  const [updated] = await db
    .update(clientAccess)
    .set({ sentAt: new Date(), sentTo: to, email: link.email ?? to })
    .where(eq(clientAccess.id, link.id))
    .returning();
  return updated;
}

/**
 * Sends the "expires soon" email for every live link that expires within
 * EXPIRY_REMINDER_LEAD_MS, has a client address, and hasn't had its reminder for the
 * current expiry date. Each link is claimed (expiryReminderSentAt set) before its email
 * goes out, so overlapping runs can't send twice; a failed send releases the claim so
 * the next run retries. Run daily by the worker. Returns how many were sent.
 */
export async function sendDueExpiryReminders(now = new Date()) {
  const due = await db
    .select({ link: clientAccess, gallery: galleries })
    .from(clientAccess)
    .innerJoin(galleries, eq(galleries.id, clientAccess.galleryId))
    .where(
      and(
        isNull(clientAccess.revokedAt),
        isNull(clientAccess.expiryReminderSentAt),
        isNotNull(clientAccess.expiresAt),
        gt(clientAccess.expiresAt, now),
        lte(clientAccess.expiresAt, new Date(now.getTime() + EXPIRY_REMINDER_LEAD_MS)),
        or(isNotNull(clientAccess.email), isNotNull(clientAccess.sentTo)),
      ),
    );

  let sent = 0;
  for (const { link, gallery } of due) {
    const to = link.email ?? link.sentTo;
    if (!to || !link.expiresAt) continue;

    const [claimed] = await db
      .update(clientAccess)
      .set({ expiryReminderSentAt: now })
      .where(and(eq(clientAccess.id, link.id), isNull(clientAccess.expiryReminderSentAt)))
      .returning({ id: clientAccess.id });
    if (!claimed) continue;

    try {
      const email = expiryReminderEmail({
        galleryTitle: gallery.title,
        url: clientLinkUrl(link.token),
        coverUrl: await coverJpegUrl(gallery),
        expiresAt: link.expiresAt,
      });
      await sendEmail({ to, ...email, replyTo: photographerReplyTo() });
      sent++;
    } catch (err) {
      await db.update(clientAccess).set({ expiryReminderSentAt: null }).where(eq(clientAccess.id, link.id));
      await logError("expiry-reminder", err instanceof EmailError ? new Error(`link ${link.id}: ${err.message}`) : err);
    }
  }
  return sent;
}
