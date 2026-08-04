type FriendRequestEmail = {
  subject: string;
  text: string;
  html: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function friendRequestEmail(
  senderName: string,
  appUrl: string,
): FriendRequestEmail {
  const sender = senderName.trim() || "Someone";
  const safeSender = escapeHtml(sender);
  const safeUrl = escapeHtml(appUrl);

  return {
    subject: `${sender} added you as a friend on UKC Icebreaker`,
    text: `${sender} added you as a friend! Get on UKC Icebreaker to find out and respond: ${appUrl}`,
    html: `
      <div style="background:#0a121c;color:#f2f6fa;font-family:Arial,sans-serif;padding:32px 20px">
        <div style="margin:0 auto;max-width:520px">
          <p style="color:#4fd1e8;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">UKC Icebreaker</p>
          <h1 style="font-size:26px;line-height:1.2;margin:12px 0">${safeSender} added you as a friend!</h1>
          <p style="color:#b5c4d4;font-size:16px;line-height:1.5;margin:0 0 24px">Open UKC Icebreaker to view and respond to the request.</p>
          <a href="${safeUrl}" style="background:#4fd1e8;border-radius:10px;color:#06222b;display:inline-block;font-size:15px;font-weight:700;padding:13px 18px;text-decoration:none">View friend request</a>
        </div>
      </div>
    `.trim(),
  };
}

export function friendRequestAppUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return new URL("/people", base).toString();
}

export async function sendFriendRequestEmail({
  recipientEmail,
  senderName,
}: {
  recipientEmail: string;
  senderName: string;
}): Promise<"sent" | "not-configured"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FRIEND_REQUEST_EMAIL_FROM;
  if (!apiKey || !from) return "not-configured";

  const email = friendRequestEmail(senderName, friendRequestAppUrl());
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipientEmail],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}`);
  }
  return "sent";
}
