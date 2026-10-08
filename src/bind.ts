import type { TiliaLinkClient } from './index';

/**
 * The one client the module-level helpers (`_t`, `_n`, `logError`) talk to.
 * A game binds it once in its entry point, right after constructing the
 * client and before any scene boots. Unbound, each helper has its own
 * fallback: the msgid for strings, console only for errors.
 */

let client: TiliaLinkClient | null = null;

export function bindTiliaLink(tiliaLink: TiliaLinkClient | null) {
  client = tiliaLink;
}

export function boundClient(): TiliaLinkClient | null {
  return client;
}
