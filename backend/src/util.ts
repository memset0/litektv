import { randomUUID } from "node:crypto";

export const uuid = () => randomUUID();

export const now = () => Date.now();

export function clampString(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.slice(0, max);
}
