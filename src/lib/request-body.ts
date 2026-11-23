import { NextResponse } from "next/server";

/** A request body that is a JSON object, or null for anything else (bad JSON, an
 * array, a bare string). Route handlers used to cast `await req.json()` straight to
 * the shape they hoped for, so malformed input surfaced as a 500 and an error-log
 * entry instead of a 400 the caller can act on. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** Thrown by the field readers below; turned into a 400 by `withValidation`. */
export class BodyError extends Error {}

type StringOptions = { max?: number; trim?: boolean };

/** A required, non-empty string field. */
export function requiredString(body: Record<string, unknown>, key: string, options: StringOptions = {}): string {
  const value = optionalString(body, key, options);
  if (!value) throw new BodyError(`${key} is required`);
  return value;
}

/** A string field that may be missing. Present-but-wrong-type is still an error. */
export function optionalString(body: Record<string, unknown>, key: string, options: StringOptions = {}): string | undefined {
  const raw = body[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new BodyError(`${key} must be a string`);
  const value = options.trim === false ? raw : raw.trim();
  if (options.max !== undefined && value.length > options.max) {
    throw new BodyError(`${key} must be at most ${options.max} characters`);
  }
  return value;
}

/** Like optionalString, but null is kept as an explicit "clear this field". */
export function nullableString(
  body: Record<string, unknown>,
  key: string,
  options: StringOptions = {},
): string | null | undefined {
  if (body[key] === null) return null;
  return optionalString(body, key, options);
}

export function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const raw = body[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "boolean") throw new BodyError(`${key} must be true or false`);
  return raw;
}

export function optionalInteger(body: Record<string, unknown>, key: string, min = 0, max = 1_000_000): number | undefined {
  const raw = body[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
    throw new BodyError(`${key} must be a whole number from ${min} to ${max}`);
  }
  return raw;
}

export function optionalEnum<T extends string>(body: Record<string, unknown>, key: string, allowed: readonly T[]): T | undefined {
  const raw = body[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !(allowed as readonly string[]).includes(raw)) {
    throw new BodyError(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return raw as T;
}

/** An array of non-empty strings (ids), capped so one request can't name millions. */
export function stringArray(body: Record<string, unknown>, key: string, maxItems = 5000): string[] {
  const raw = body[key];
  if (!Array.isArray(raw) || raw.length === 0) throw new BodyError(`${key} must be a non-empty list`);
  if (raw.length > maxItems) throw new BodyError(`${key} can hold at most ${maxItems} items`);
  if (!raw.every((v) => typeof v === "string" && v.length > 0 && v.length <= 200)) {
    throw new BodyError(`${key} must be a list of ids`);
  }
  return raw as string[];
}

/** An ISO date string or null. */
export function nullableDate(body: Record<string, unknown>, key: string): Date | null | undefined {
  const raw = body[key];
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new BodyError(`${key} must be a date`);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new BodyError(`${key} must be a date`);
  return date;
}

/**
 * Runs a handler with the parsed JSON object body; bad JSON and any BodyError from
 * the field readers become a 400 with the reader's message.
 */
export async function withJsonBody(
  req: Request,
  handler: (body: Record<string, unknown>) => Promise<Response>,
): Promise<Response> {
  const body = await readJsonObject(req);
  if (!body) return badRequest("request body must be a JSON object");
  try {
    return await handler(body);
  } catch (err) {
    if (err instanceof BodyError) return badRequest(err.message);
    throw err;
  }
}
