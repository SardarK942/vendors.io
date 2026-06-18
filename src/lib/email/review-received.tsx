// src/lib/email/review-received.tsx
import { sendWithRecord, escapeHtml } from '@/lib/email/resend';

interface ReviewReceivedArgs {
  coupleName: string;
  rating: number; // 1–5
  body: string; // pre-truncated to 240 chars
  vendorSlug: string;
}

export function renderReviewReceivedHtml(args: ReviewReceivedArgs): string {
  const stars = '★★★★★'.slice(0, args.rating) + '☆☆☆☆☆'.slice(0, 5 - args.rating);

  const safeCoupleName = escapeHtml(args.coupleName);
  const safeRating = escapeHtml(String(args.rating));
  const safeStars = escapeHtml(stars);
  const safeBody = escapeHtml(args.body);
  const safeVendorSlug = escapeHtml(args.vendorSlug);

  return `
    <div style="font-family: -apple-system, sans-serif; background:#FBF6EC; color:#1B1414; padding:24px;">
      <h1 style="font-size:22px; margin:0 0 16px;">New review from ${safeCoupleName}</h1>
      <p style="font-size:28px; margin:0 0 8px; letter-spacing:2px;">${safeStars}</p>
      <p style="margin:0 0 4px;"><strong>${safeRating} out of 5 stars</strong></p>
      <p style="background:#F0EAD8; border-left:3px solid #1B1414; padding:12px 16px; margin:16px 0; border-radius:0 4px 4px 0;">${safeBody}</p>
      <p style="margin-top:24px;">
        <a href="https://www.baazar.io/vendors/${safeVendorSlug}?tab=reviews"
           style="background:#1B1414; color:#FBF6EC; padding:12px 20px; text-decoration:none; border-radius:6px;">
          Read full review
        </a>
      </p>
    </div>
  `;
}

export async function sendReviewReceivedEmail(args: {
  to: string;
  coupleName: string;
  rating: number;
  body: string;
  vendorSlug: string;
  notificationId?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const truncated = args.body.slice(0, 240);
  const subject = `${args.coupleName} left you a ${args.rating}-star review`;
  return sendWithRecord({
    to: args.to,
    subject,
    html: renderReviewReceivedHtml({
      coupleName: args.coupleName,
      rating: args.rating,
      body: truncated,
      vendorSlug: args.vendorSlug,
    }),
    notificationId: args.notificationId,
  });
}
