"use client";

import { useState, useTransition } from "react";
import { checkOpenAIConnection } from "@/app/actions/admin";

export default function AdminOpenAIHealth() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function run() {
    setResult(null);
    setOk(false);
    startTransition(async () => {
      const response = await checkOpenAIConnection();
      setOk(response.ok);
      setResult(
        response.ok
          ? `Connected · ${response.model} · ${response.response} · request ${response.requestId}`
          : `${response.model ? `${response.model} · ` : ""}${response.error}`,
      );
    });
  }

  return (
    <div
      style={{
        borderBottom: "1px solid var(--line)",
        paddingBottom: 20,
        marginBottom: 20,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>OpenAI vision</h2>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "4px 0 12px" }}>
        Sends one tiny image through the same key and model used by boarding-pass scanning.
        The API key is never displayed.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        style={{
          minHeight: 40,
          padding: "0 14px",
          border: "1px solid var(--line)",
          borderRadius: 10,
          background: "transparent",
          color: "var(--ink)",
          fontSize: 14,
          fontWeight: 700,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Testing…" : "Test OpenAI connection"}
      </button>
      {result && (
        <p
          role="status"
          style={{
            marginTop: 10,
            fontSize: 13,
            color: ok ? "var(--accent)" : "var(--danger)",
            overflowWrap: "anywhere",
          }}
        >
          {result}
        </p>
      )}
    </div>
  );
}
