import { NextResponse } from "next/server";
import { logError } from "@/lib/error-log";

/** Wraps a route handler so an unexpected throw (a DB hiccup, a bad redirect target)
 * gets logged to error_log and a generic message, instead of either Next's default
 * response or -- worse -- an unhandled rejection that skips logging entirely. Several
 * of the smaller public API routes had no error handling of their own; this covers
 * them without restructuring each one individually. Mirrors the explicit try/catch +
 * logError pattern already used by the zip-download and storage routes. */
export function withErrorLogging<Args extends unknown[]>(
  context: string,
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      await logError(context, err);
      return NextResponse.json({ error: "something went wrong" }, { status: 500 });
    }
  };
}
