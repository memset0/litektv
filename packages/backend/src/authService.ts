import { hashPassword, mintToken, verifyPassword } from "./auth.js";
import {
  createSession,
  deleteSession,
  findAccountByName,
  findSessionByToken,
  getAccountById,
  insertAccount,
  linkUserToAccount,
  mergeAnonFavoritesIntoAccount,
  touchAccount,
  touchSession,
  updateAccount,
} from "./db.js";
import type { Account } from "./types.js";
import { now, uuid } from "./util.js";

const NAME_RE = /^[A-Za-z0-9_\-一-鿿]+$/;

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 24) {
    throw new AuthError("name length must be 3–24");
  }
  if (!NAME_RE.test(trimmed)) {
    throw new AuthError("name has illegal characters");
  }
  return trimmed;
}

function validatePassword(password: string): void {
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    throw new AuthError("password length must be 8–200");
  }
}

export interface AuthOk {
  token: string;
  account: { id: string; name: string; emoji: string };
}

export async function signup(args: {
  name: string;
  password: string;
  emoji?: string;
  /** Anonymous userId from the connecting client; if present we merge their
   *  anonymous favorites into the new account in the same transaction. */
  userId?: string;
}): Promise<AuthOk> {
  const name = validateName(args.name);
  validatePassword(args.password);
  if (findAccountByName(name)) {
    throw new AuthError("name taken");
  }
  const accountId = uuid();
  const passwordHash = await hashPassword(args.password);
  const ts = now();
  insertAccount({
    accountId,
    name,
    emoji: args.emoji?.slice(0, 8) || "🎤",
    passwordHash,
    createdAt: ts,
  });
  if (args.userId) {
    mergeAnonFavoritesIntoAccount(args.userId, accountId, ts);
  } else {
    // best-effort: still record the link if a userId surfaces later via attach
  }
  const token = mintToken();
  createSession({ token, accountId, createdAt: ts });
  const account = getAccountById(accountId)!;
  return { token, account: { id: account.accountId, name: account.name, emoji: account.emoji } };
}

export async function login(args: {
  name: string;
  password: string;
  userId?: string;
}): Promise<AuthOk> {
  const name = validateName(args.name);
  validatePassword(args.password);
  const row = findAccountByName(name);
  if (!row) throw new AuthError("invalid credentials");
  const ok = await verifyPassword(row.passwordHash, args.password);
  if (!ok) throw new AuthError("invalid credentials");
  const ts = now();
  touchAccount(row.accountId, ts);
  if (args.userId) {
    mergeAnonFavoritesIntoAccount(args.userId, row.accountId, ts);
  }
  const token = mintToken();
  createSession({ token, accountId: row.accountId, createdAt: ts });
  return {
    token,
    account: { id: row.accountId, name: row.name, emoji: row.emoji },
  };
}

export function attachSession(args: {
  token: string;
  userId?: string;
}): { account: Account; sessionToken: string } | null {
  const session = findSessionByToken(args.token);
  if (!session) return null;
  const account = getAccountById(session.accountId);
  if (!account) {
    deleteSession(args.token);
    return null;
  }
  const ts = now();
  touchSession(args.token, ts);
  touchAccount(account.accountId, ts);
  if (args.userId) {
    // Keep the userId↔account link fresh so future anonymous merges target
    // the right account even before login fires.
    linkUserToAccount(args.userId, account.accountId, ts);
  }
  return { account, sessionToken: args.token };
}

export function logout(token: string): void {
  deleteSession(token);
}

export async function updateProfile(args: {
  accountId: string;
  name?: string;
  emoji?: string;
  password?: string;
}): Promise<Account> {
  const cur = getAccountById(args.accountId);
  if (!cur) throw new AuthError("account not found");
  let nextName = cur.name;
  if (args.name !== undefined && args.name !== cur.name) {
    nextName = validateName(args.name);
    const collision = findAccountByName(nextName);
    if (collision && collision.accountId !== cur.accountId) {
      throw new AuthError("name taken");
    }
  }
  let passwordHash: string | undefined;
  if (args.password !== undefined) {
    validatePassword(args.password);
    passwordHash = await hashPassword(args.password);
  }
  updateAccount(cur.accountId, {
    name: nextName !== cur.name ? nextName : undefined,
    emoji: args.emoji !== undefined ? args.emoji.slice(0, 8) : undefined,
    passwordHash,
  });
  return getAccountById(cur.accountId)!;
}
