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

  // Plain and short on purpose. A notification's whole job is to say who and
  // give a way in, and a light background survives every mail client, where a
  // dark card gets inverted or washed out by a few of them.
  return {
    subject: `${sender} sent you a friend request`,
    text: `${sender} sent you a friend request on UKC Icebreaker.\n\nOpen it here: ${appUrl}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#101625">
        <p style="margin:0 0 16px">${safeSender} sent you a friend request on UKC Icebreaker.</p>
        <p style="margin:0"><a href="${safeUrl}" style="color:#0e7c99">Open it here</a></p>
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

// Sent over SMTP rather than a transactional API so this works from an ordinary
// mailbox. An API provider will not send from a domain you cannot prove you own,
// and we do not have one; a Gmail or Workspace account with an app password
// needs no domain at all. The cost is Gmail's roughly 500 a day ceiling and
// weaker deliverability than a verified domain would give.
//
// Defaults target Gmail. SMTP_HOST and SMTP_PORT are there so moving to a real
// domain later is an environment change rather than a code change.
export async function sendFriendRequestEmail({
  recipientEmail,
  senderName,
}: {
  recipientEmail: string;
  senderName: string;
}): Promise<"sent" | "not-configured"> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) return "not-configured";

  // Gmail rejects a From that is not the authenticated account or one of its
  // verified aliases, so the account itself is the default rather than a name
  // someone has to remember to keep in sync.
  const from = process.env.FRIEND_REQUEST_EMAIL_FROM || `UKC Icebreaker <${user}>`;
  const port = Number(process.env.SMTP_PORT ?? 465);

  const email = friendRequestEmail(senderName, friendRequestAppUrl());
  const { createTransport } = await import("nodemailer");
  const transport = createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
    // A friend request must not hang on a stalled mail server. hi.ts already
    // treats a throw here as non-fatal, so a timeout costs the email, not the
    // request itself.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });

  await transport.sendMail({
    from,
    to: recipientEmail,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  return "sent";
}
