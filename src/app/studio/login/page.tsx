import { requestMagicLink } from "./actions";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-lg font-medium text-neutral-900">Sign in</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Enter the admin email address. A sign-in link will be sent to it.
      </p>
      <form action={requestMagicLink} className="mt-6 space-y-3">
        <input
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button
          type="submit"
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Send sign-in link
        </button>
      </form>
    </div>
  );
}
