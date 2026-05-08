import { randomBytes } from "node:crypto";
import argon2 from "argon2";

/** Argon2id with the library's defaults. Awaitable. */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** 32 random bytes, url-safe base64 (no padding). ~43 chars. */
export function mintToken(): string {
  return randomBytes(32).toString("base64url");
}
