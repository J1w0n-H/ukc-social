import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  friendRequestAppUrl,
  friendRequestEmail,
  sendFriendRequestEmail,
} from "./friendRequestEmail";

type SmtpOptions = { host: string; port: number; secure: boolean; auth: { user: string; pass: string } };
type Message = { from: string; to: string; subject: string; text: string; html: string };

const sendMail = vi.fn((_message: Message) => Promise.resolve({ accepted: [_message.to] }));
const createTransport = vi.fn((_options: SmtpOptions) => ({ sendMail }));
vi.mock("nodemailer", () => ({ createTransport: (o: SmtpOptions) => createTransport(o) }));

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue({ accepted: ["friend@example.test"] });
  createTransport.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("friendRequestEmail", () => {
  it("includes the sender, call to action, and escaped HTML", () => {
    const email = friendRequestEmail('Sunny <script>"', "https://example.test/people");

    expect(email.subject).toContain('Sunny <script>"');
    expect(email.subject).toContain("sent you a friend request");
    expect(email.text).toContain("sent you a friend request on UKC Icebreaker");
    expect(email.text).toContain("https://example.test/people");
    expect(email.html).toContain("Sunny &lt;script&gt;&quot;");
    expect(email.html).not.toContain("<script>");
  });

  it("builds the People link from the configured production origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://icebreaker.example/somewhere");
    expect(friendRequestAppUrl()).toBe("https://icebreaker.example/people");
  });
});

describe("sendFriendRequestEmail", () => {
  const send = () =>
    sendFriendRequestEmail({ recipientEmail: "friend@example.test", senderName: "Sunny" });

  it("skips delivery when no mailbox is configured", async () => {
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASSWORD", "");

    await expect(send()).resolves.toBe("not-configured");
    expect(createTransport).not.toHaveBeenCalled();
  });

  // A user without a password is the half-configured case, and sending would
  // fail at the server rather than here.
  it("skips delivery when the password is missing", async () => {
    vi.stubEnv("SMTP_USER", "icebreaker@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "");

    await expect(send()).resolves.toBe("not-configured");
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("sends the expected message over SMTP", async () => {
    vi.stubEnv("SMTP_USER", "icebreaker@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://icebreaker.example");

    await expect(send()).resolves.toBe("sent");

    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: "friend@example.test",
      subject: "Sunny sent you a friend request",
    });
    expect(sendMail.mock.calls[0][0].text).toContain("https://icebreaker.example/people");
  });

  it("defaults Gmail to an implicit TLS connection on 465", async () => {
    vi.stubEnv("SMTP_USER", "icebreaker@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "app-password");

    await send();

    expect(createTransport.mock.calls[0][0]).toMatchObject({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "icebreaker@gmail.test", pass: "app-password" },
    });
  });

  // 587 is STARTTLS, which nodemailer upgrades from a plaintext socket, so
  // `secure` has to be off or the handshake never completes.
  it("switches off implicit TLS on the STARTTLS port", async () => {
    vi.stubEnv("SMTP_USER", "icebreaker@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    vi.stubEnv("SMTP_PORT", "587");

    await send();

    expect(createTransport.mock.calls[0][0]).toMatchObject({ port: 587, secure: false });
  });

  // Gmail refuses a From that is not the authenticated mailbox, so the account
  // is the default and an explicit value still wins for a real domain later.
  it("falls back to the authenticated mailbox as the sender", async () => {
    vi.stubEnv("SMTP_USER", "icebreaker@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    vi.stubEnv("FRIEND_REQUEST_EMAIL_FROM", "");

    await send();

    expect(sendMail.mock.calls[0][0].from).toBe("UKC Icebreaker <icebreaker@gmail.test>");
  });

  it("prefers an explicit sender when one is set", async () => {
    vi.stubEnv("SMTP_USER", "icebreaker@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    vi.stubEnv("FRIEND_REQUEST_EMAIL_FROM", "UKC <friends@icebreaker.example>");

    await send();

    expect(sendMail.mock.calls[0][0].from).toBe("UKC <friends@icebreaker.example>");
  });

  it("reports delivery failures to the caller", async () => {
    vi.stubEnv("SMTP_USER", "icebreaker@gmail.test");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    sendMail.mockRejectedValueOnce(new Error("Invalid login: 535-5.7.8"));

    await expect(send()).rejects.toThrow("Invalid login");
  });
});
