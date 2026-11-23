import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt via node:crypto rather than adding a bcrypt/argon2 dependency -- single
// admin account, no high-volume login endpoint to worry about tuning cost factors
// for at scale.
//
// The async form, not scryptSync: each hash costs ~50ms of CPU, and the sync version
// ran it on the event loop, so every password guess (sign-in, gallery and client-link
// passwords) froze all other requests on the server for that long. The async one runs
// in libuv's thread pool. Stored hashes are the same format either way.
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, salt, KEY_LENGTH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
