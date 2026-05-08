/**
 * Shared helper used by both setFavoriteMeta and autoMetaScan: apply a
 * favorite manual-metadata patch and write the matching audit row in one
 * step. Lives in its own module so the CLIs can import it without
 * triggering each other's `main()` at module-load time.
 */

import {
  appendFavoriteAudit,
  updateFavorite,
  type FavoritePatch,
} from "./db.js";
import type { Favorite, Source } from "./types.js";

export function applyMetaPatch(
  source: Source,
  videoId: string,
  page: number,
  patch: FavoritePatch,
  actor: string,
): { before: Favorite | null; after: Favorite | null } {
  const result = updateFavorite(source, videoId, page, patch);
  if (result.before && result.after) {
    appendFavoriteAudit({
      ts: Date.now(),
      op: "update",
      source,
      videoId,
      page,
      user: { name: actor },
      before: result.before,
      after: result.after,
    });
  }
  return result;
}
