import type { TiliaLinkClient } from './index';

/**
 * gettext-shaped string lookup over TiliaLink's string channel.
 *
 * This is the game-side half of `requestString`: the host owns the catalog, and
 * a game only ever writes English msgids at the call site. It lives here rather
 * than in each game because the Django extractor keys on the identifiers `_t`
 * and `_n` (see tiliaplay's makemessages override, `--keyword=_t:1c,2`), so
 * every copy of this wrapper has to agree with the extractor exactly — and
 * seven near-identical copies did not.
 *
 * The lookup is synchronous by design. `requestString` resolves same-page and
 * calls back before it returns, so `_t()` can be used inline in a Phaser text
 * style or a template literal. With no client bound — standalone dev, or a host
 * that has no catalog — the msgid itself is the fallback, which is readable
 * English rather than a missing-key marker.
 *
 * Nothing in here touches an engine: it is msgids in, strings out.
 */

let client: TiliaLinkClient | null = null;

export function bindTiliaLink(tiliaLink: TiliaLinkClient | null) {
  client = tiliaLink;
}

export function _t(msgid: string): string;
export function _t(context: string, msgid: string): string;
export function _t(a: string, b?: string): string {
  let msgid = a;
  let context: string | undefined;
  if (b !== undefined) {
    context = a;
    msgid = b;
  }
  if (!client) return msgid;
  let resolved = msgid;
  client.requestString({ msgid, context }, (text: string) => {
    resolved = text;
  });
  return resolved;
}

export function _n(singular: string, plural: string, count: number): string;
export function _n(context: string, singular: string, plural: string, count: number): string;
export function _n(a: string, b: string, c: string | number, d?: number): string {
  let context: string | undefined;
  let singular = a;
  let plural = b;
  let count = c as number;
  if (d !== undefined) {
    context = a;
    singular = b;
    plural = c as string;
    count = d;
  }
  let fallback = plural;
  if (count === 1) fallback = singular;
  if (!client) return fallback;
  let resolved = fallback;
  client.requestString({ msgid: singular, context, plural, count }, (text: string) => {
    resolved = text;
  });
  return resolved;
}

/**
 * Django-style named interpolation. An unknown name is left as literal text
 * rather than becoming "undefined", so a typo ships as a visible `%(name)s`
 * that check_game_i18n's placeholder pass can catch.
 */
export function interpolate(fmt: string, values: Record<string, string | number>): string {
  return fmt.replace(/%\((\w+)\)s/g, function (match, name) {
    if (!(name in values)) return match;
    return String(values[name]);
  });
}
