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
export declare function _t(msgid: string): string;
export declare function _t(context: string, msgid: string): string;
export declare function _n(singular: string, plural: string, count: number): string;
export declare function _n(context: string, singular: string, plural: string, count: number): string;
/**
 * Django-style named interpolation. An unknown name is left as literal text
 * rather than becoming "undefined", so a typo ships as a visible `%(name)s`
 * that check_game_i18n's placeholder pass can catch.
 */
export declare function interpolate(fmt: string, values: Record<string, string | number>): string;
