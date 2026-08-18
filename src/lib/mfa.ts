import * as OTPAuth from "otpauth";

const ISSUER = "Mosa Mian Photography";

export function generateSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function totpUri(secret: string, accountEmail: string) {
  return totp(secret, accountEmail).toString();
}

/** One step of drift tolerance either side of "now", to absorb clock skew. */
export function verifyTotp(secret: string, accountEmail: string, code: string) {
  const delta = totp(secret, accountEmail).validate({ token: code.trim(), window: 1 });
  return delta !== null;
}
