/** A lowercase SHA-256 hex digest. */
export function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** A key shaped exactly like originalKey() makes: originals/yyyy/mm/{sha256}.{ext}.
 * Upload routes only presign or abort keys of this shape, so a signed-in session
 * can't be used to write or cancel anything else in the bucket. */
export function isOriginalKey(key: string): boolean {
  return /^originals\/\d{4}\/\d{2}\/[0-9a-f]{64}\.[a-z0-9]{1,10}$/.test(key);
}
