import type { TiliaLinkClient } from './index';
export declare function bindTiliaLink(tiliaLink: TiliaLinkClient | null): void;
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
