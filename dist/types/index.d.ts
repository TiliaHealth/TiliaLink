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
    onStart(handler: TiliaEventHandler): void;
    onPause(handler: TiliaEventHandler): void;
    onResume(handler: TiliaEventHandler): void;
    /**
     * Register a config validator.
     * handler receives (configs, done) where done is called as:
     *   done(true)              — configs are valid
     *   done(false, messages)   — configs are invalid, messages is optional
     */
    onValidateConfigs(handler: (configs: any, done: (valid: boolean, messages?: any) => void) => void): void;
    emitReady(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
    emitData(type: string, data?: TiliaEventPayload): void;
    emitDataFlush(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
    emitLevelComplete(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
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
    sendStart(config: TiliaEventPayload): void;
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
