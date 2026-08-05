// Sends one real friend-request email through the app's own sender, for
// checking delivery and rendering in a live inbox.
//
//   node --env-file=.env.local scripts/send-test-friend-email.mjs you@example.com "Sam"
//
// Needs SMTP_USER and SMTP_PASSWORD in .env.local. Never prints them.
import { sendFriendRequestEmail } from "../lib/friendRequestEmail.ts";

const [to, sender = "Sam"] = process.argv.slice(2);
if (!to) {
  console.error("usage: send-test-friend-email.mjs <recipient> [senderName]");
  process.exit(1);
}
if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
  console.error(
    "SMTP_USER and SMTP_PASSWORD are not set. Add them to .env.local:\n" +
      "  SMTP_USER=your.address@gmail.com\n" +
      "  SMTP_PASSWORD=<16-character Google App Password, no spaces>\n" +
      "App Passwords need 2FA on the account: https://myaccount.google.com/apppasswords",
  );
  process.exit(1);
}

try {
  const result = await sendFriendRequestEmail({ recipientEmail: to, senderName: sender });
  console.log(`${result} -> ${to} (from ${process.env.SMTP_USER})`);
} catch (e) {
  console.error("send failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
