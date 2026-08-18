"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function SetupMfaPage() {
  const router = useRouter();
  const { update } = useSession();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/mfa/enroll")
      .then((res) => res.json())
      .then((data) => {
        setQrDataUrl(data.qrDataUrl);
        setSecret(data.secret);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/mfa/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("That code didn't match. Try the next one.");
      return;
    }
    await update({ mfaEnrolled: true, mfaVerified: true });
    router.push("/studio");
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-lg font-medium text-neutral-900">Set up two-factor authentication</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Scan this with an authenticator app (1Password, Authy, Google Authenticator), then enter
        the 6-digit code to confirm.
      </p>
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="TOTP QR code" className="mt-6 h-48 w-48" />
      ) : (
        <div className="mt-6 h-48 w-48 animate-pulse bg-neutral-200" />
      )}
      {secret ? (
        <p className="mt-2 break-all text-xs text-neutral-400">Manual entry key: {secret}</p>
      ) : null}
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Confirm and enable
        </button>
      </form>
    </div>
  );
}
