import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export async function hashToken(token: string): Promise<string> {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyToken(
  token: string,
  hash: string,
): Promise<boolean> {
  const actual = Buffer.from(await hashToken(token), "hex");
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
