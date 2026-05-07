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
    emitData(data: TiliaEventPayload): void;
    emitDataFlush(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
    emitLevelComplete(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
    emitGameEnd(data?: TiliaEventPayload, done?: TiliaDoneCallback): void;
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
    sendStart(config: TiliaEventPayload): void;
    sendPause(): void;
    sendResume(): void;
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
