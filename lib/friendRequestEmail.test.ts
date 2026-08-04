import { afterEach, describe, expect, it, vi } from "vitest";
import {
  friendRequestAppUrl,
  friendRequestEmail,
  sendFriendRequestEmail,
} from "./friendRequestEmail";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("friendRequestEmail", () => {
  it("includes the sender, call to action, and escaped HTML", () => {
    const email = friendRequestEmail('Sunny <script>"', "https://example.test/people");

    expect(email.subject).toContain('Sunny <script>"');
    expect(email.text).toContain("Get on UKC Icebreaker");
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
  it("skips delivery when email is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("FRIEND_REQUEST_EMAIL_FROM", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendFriendRequestEmail({
        recipientEmail: "friend@example.test",
        senderName: "Sunny",
      }),
    ).resolves.toBe("not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the expected transactional email through Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("FRIEND_REQUEST_EMAIL_FROM", "UKC <friends@icebreaker.example>");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://icebreaker.example");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendFriendRequestEmail({
        recipientEmail: "friend@example.test",
        senderName: "Sunny",
      }),
    ).resolves.toBe("sent");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(options.body)).toMatchObject({
      from: "UKC <friends@icebreaker.example>",
      to: ["friend@example.test"],
      subject: "Sunny added you as a friend on UKC Icebreaker",
    });
  });

  it("reports provider failures to the caller", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("FRIEND_REQUEST_EMAIL_FROM", "UKC <friends@icebreaker.example>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));

    await expect(
      sendFriendRequestEmail({
        recipientEmail: "friend@example.test",
        senderName: "Sunny",
      }),
    ).rejects.toThrow("Email provider returned 422");
  });
});
