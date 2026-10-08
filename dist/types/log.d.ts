import type { TiliaEventPayload } from './index';
/**
 * Error reporting a game can call from any module, bound or not.
 *
 * Games may not touch `console` (template-phaserio-game
 * Rules/no-dom-and-globals.md), so the SDK does it for them: every call writes
 * a `console.error`. Once a client is bound the error also goes out through
 * `emitError` as a `game:error` event, so the host can record it instead of
 * it ending in a devtools panel nobody has open on a participant's phone.
 */
export declare function logError(type: string, data?: TiliaEventPayload): void;
