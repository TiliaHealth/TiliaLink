/**
 * TiliaLink - DOM-Scoped Communication Bridge
 * Scopes events to a shared DOM element to avoid global window pollution
 * while preserving full access to Web APIs (Vibrate, Sensors, etc.)
 *
 * Communication patterns:
 *   emit(event, data)           — fire-and-forget message
 *   emit(event, data, callback) — message with callback (same-page only)
 *
 * When a callback is passed, it is attached to the event detail as `_done`.
 * The receiving side's `on()` handler gets it as a second argument:
 *   on(event, (data, done) => { ... done(result) })
 */
export interface TiliaEventPayload {
    [key: string]: any;
}
export type TiliaDoneCallback = (...args: any[]) => void;
export type TiliaEventHandler<T = any> = (detail: T, done: TiliaDoneCallback) => void;
export interface TiliaStringQuery {
    msgid: string;
    context?: string;
    plural?: string;
    count?: number;
}
export type TiliaStringDone = (text: string) => void;
export type TiliaStringHandler = (query: TiliaStringQuery, done: TiliaStringDone) => void;
export type TiliaModalDone = (result?: any) => void;
export type TiliaModalRenderer = (contents: TiliaEventPayload, done: TiliaModalDone) => void;
export interface TiliaModalOptions {
    timeoutMs?: number;
}
export interface TiliaGameConfigs<TSession = Record<string, unknown>> {
    levels: unknown[];
    [key: string]: unknown;
}
/**
 * The Client-side Link (Used by Game/Assessment developers)
 */
export declare class TiliaLinkClient {
    private element;
    private prefix;
    constructor(element: HTMLElement);
    /**
     * Listen for a message from the Host.
     * handler receives (detail, done) where done is the callback provided by the sender, or a no-op.
     */
    on(eventName: string, handler: TiliaEventHandler): void;
    /**
     * Send a message to the Host.
     * Optional callback will be delivered to the handler as `done`.
     */
    emit(eventName: string, detail?: TiliaEventPayload, callback?: TiliaDoneCallback | null): void;
    /**
     * Synchronous access to configurations stored on the element by the host
     */
    getGameConfigs<TSession = Record<string, unknown>>(): TiliaGameConfigs<TSession> | null;
    /**
     * Synchronous access to translated strings stored on the element by the host.
     * Returns a {key: translatedText} map, or empty object if none set.
     */
    getStrings(): Record<string, string>;
    /**
     * Get a single translated string by key.
     * Returns the translated string, or empty string if not found.
     */
    getString(key: string): string;
    /**
     * Request translation for keys not pre-set by the host.
     * The host resolves them and calls callback with a {key: translatedText} map.
     */
    requestStrings(keys: string[], callback: TiliaDoneCallback): void;
    /**
     * Request the translation of a single gettext msgid, optionally namespaced by
     * context. Supplying `plural` + `count` selects a plural form instead.
     * The host resolves it against Django's JS catalog.
     *
     * `emit` dispatches a CustomEvent, so a registered host handler runs inside
     * this call and invokes `callback` before `requestString` returns. That is
     * what lets the game's `_t()` wrapper stay a plain synchronous function.
     *
     * With no host attached nothing dispatches and `callback` never fires — the
     * caller keeps its English msgid, which is the standalone-dev fallback.
     */
    requestString(query: TiliaStringQuery, callback: TiliaStringDone): void;
    /**
     * The host's start signal. It carries no payload: every configuration value
     * travels through setConfigs() / getGameConfigs() and is in place before
     * the game emits game:ready. A handler that wants tuning reads it there.
     */
    onStart(handler: () => void): void;
    onPause(handler: TiliaEventHandler): void;
    onResume(handler: TiliaEventHandler): void;
    /**
     * Register a config validator.
     * handler receives (configs, done) where done is called as:
     *   done(true)              — configs are valid
     *   done(false, messages)   — configs are invalid, messages is optional
     */
    onValidateConfigs(handler: (configs: any, done: (valid: boolean, messages?: any) => void) => void): void;
    /**
     * Announce that the bundle has booted and the game is mounted.
     *
     * OPTIONAL. The host does not block on it; it is a diagnostic marker that
     * separates "never loaded" from "loaded and then went quiet" when a session
     * arrives empty.
     */
    emitReady(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
    /**
     * Emit one measurement row. REQUIRED — this is the whole point of the game.
     *
     * The host appends each row to its event log and syncs it to the server. A
     * game that never calls this produces no dataset, however well it plays.
     *
     * `data` must be FLAT and `snake_case`, and emitted at the moment the data
     * point completes, not buffered into an end-of-run summary — a participant
     * who closes the tab must still leave behind everything up to that point.
     * Throws if `type` is missing, since an untyped row cannot be queried.
     */
    emitData(type: string, data?: TiliaEventPayload): void;
    /**
     * Ask the host to sync buffered rows to the server now.
     *
     * OPTIONAL, and purely an optimisation. The host autosaves on an interval
     * and flushes again inside its `game:game-end` handler, so a game that never
     * calls this loses nothing — it only syncs later. Use it before a long pause
     * or a risky transition to shorten the window of unsynced data. Do not treat
     * it as part of the completion contract.
     */
    /**
     * Report an error the game noticed. Writes a `console.error` and emits
     * `game:error` with the same `type` and `data`. It is a separate channel
     * from `game:data`: the host decides with `on('game:error', ...)` whether an
     * error goes to its event log, to Bugsink, or both.
     *
     * Games call this instead of `console`, which they may not touch. Prefer the
     * module-level `logError`, which works from any module and before binding.
     */
    emitError(type: string, data?: TiliaEventPayload): void;
    emitDataFlush(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
    /**
     * Report that a level finished.
     *
     * OPTIONAL progress telemetry. It is not a gate: the host does not count
     * these or decide the session is over from them. Level results that matter
     * analytically belong in `emitData` rows; this is a coarse progress ping on
     * top of those.
     */
    emitLevelComplete(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
    /**
     * Declare the session over. REQUIRED, and the single most consequential call
     * in this API.
     *
     * The host's `onGameEnd` handler appends a final `game-complete` row, stops
     * the autosave interval, flushes everything to the server and — when a
     * `SCHEDULED_ASSESSMENT_UUID` is present — POSTs `game_completion_payload`
     * back to Django, which marks the ScheduledAssessment complete and redirects
     * the participant onward.
     *
     * Nothing else triggers that. Without this call the participant finishes the
     * game, sees a normal final screen, and is simply stranded: the assessment
     * stays open forever and the researcher sees a session that never closed.
     *
     * Fire it EXACTLY ONCE, on every path that ends the session. *When* is a
     * per-game call: most games emit as soon as the game is logically over (last
     * trial, timer expiry, abort) and let the host redirect be the ending — that
     * is the default. Defer to an exit tap only when the game shows a summary
     * the participant is meant to read, since the host redirects on receipt.
     *
     * This failure is invisible from inside the game: the build is green, the
     * game plays correctly, and only the platform notices. It has already
     * shipped once, in rogueball 0.1.1/0.1.2, when a final-screen layout
     * refactor relabelled a button and dropped its call with it.
     */
    emitGameEnd(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
    /**
     * Request a host-rendered modal by name, fully data-driven via `contents`.
     *
     * Resolves with the host renderer's result, or `null` if this host has no
     * handler registered for `name` — a passthrough, so the game keeps running
     * instead of hanging. The presence check is client-side and synchronous,
     * which is what lets a pinned (older) game bundle survive an older host that
     * predates the modal: no handler on the element ⇒ resolve immediately.
     *
     * `opts.timeoutMs` (opt-in, omitted by default) guards a handler that is
     * present but broken (throws or never calls done). Do not default it on —
     * an interactive questionnaire must never time out a slow participant.
     *
     * Skips and timeouts are mirrored via emitData so a deployment that silently
     * drops a modal still leaves a fingerprint in the dataset.
     */
    callModal(name: string, contents?: TiliaEventPayload, opts?: TiliaModalOptions): Promise<any>;
}
/**
 * The Host-side Link (Used by TiliaLab Page)
 */
export declare class TiliaLinkHost {
    private element;
    private prefix;
    constructor(element: HTMLElement);
    /**
     * Listen for a message from the Game.
     * handler receives (detail, done) where done is the callback provided by the sender, or a no-op.
     */
    on(eventName: string, handler: TiliaEventHandler): void;
    /**
     * Send a message to the Game.
     * Optional callback will be delivered to the handler as `done`.
     */
    emit(eventName: string, detail?: TiliaEventPayload, callback?: TiliaDoneCallback | null): void;
    /**
     * Store configurations synchronously on the element and notify any listeners
     */
    setConfigs(configs: TiliaGameConfigs): void;
    /**
     * Store translated strings on the element for synchronous access by the client.
     */
    setStrings(strings: Record<string, string>): void;
    /**
     * Register a handler for when the client requests unknown string keys.
     * handler receives (keys: string[], done: (resolved: Record<string, string>) => void)
     */
    onStringsRequest(handler: (keys: string[], done: (resolved: Record<string, string>) => void) => void): void;
    /**
     * Register the resolver for single-msgid translation requests.
     * handler receives ({msgid, context}, done) and must call done(text).
     *
     * One generic handler serves every game: context travels in the query from
     * the game source, so the host never enumerates a game's strings.
     */
    onStringRequest(handler: TiliaStringHandler): void;
    /**
     * Bare start signal. Deliberately takes no argument: tuning must be set
     * with setConfigs() before this, never smuggled in on the start event.
     */
    sendStart(): void;
    sendPause(): void;
    sendResume(): void;
    /**
     * Register a renderer for a named modal, keyed on the shared element.
     * The client's callModal(name, contents) invokes this renderer directly
     * with (contents, done); call done(result) when the participant finishes,
     * or done() to dismiss with no result.
     *
     * The element-level registry (`_tiliaModals`) is the wire contract between
     * an old client bundle and this (possibly newer) host — keep its shape
     * additive-only. Rendering is the host's job; all matching, passthrough,
     * and skip/timeout logging live in the client's callModal.
     */
    onModal(name: string, renderer: TiliaModalRenderer): void;
    /**
     * Unregister a named modal renderer.
     */
    offModal(name: string): void;
    onReady(handler: TiliaEventHandler): void;
    onData(handler: TiliaEventHandler): void;
    onDataFlush(handler: TiliaEventHandler): void;
    onLevelComplete(handler: TiliaEventHandler): void;
    onGameEnd(handler: TiliaEventHandler): void;
    /**
     * Ask the game to validate the given configs.
     * The game calls done(true) or done(false, messages).
     */
    validateConfigs(configs: any, done: (valid: boolean, messages?: any) => void): void;
}
/**
 * Shared game-side helpers. Engine-agnostic on purpose: the string wrapper is
 * the game half of this file's own string channel, and the display units are
 * arithmetic over devicePixelRatio. Anything that has to touch a game engine
 * stays in the game — see template-phaserio-game.
 */
export { bindTiliaLink } from './bind';
export { _t, _n, interpolate } from './i18n';
export { logError } from './log';
export { resolveDevicePixelScale, resolveMaxTextureSize, bindDevicePixelScale, getDevicePixelScale, u, px, toCssPixels, scaleLayout, } from './display';
