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
/**
 * The Client-side Link (Used by Game/Assessment developers)
 */
class TiliaLinkClient {
    element;
    prefix = 'tilia:';
    constructor(element) {
        if (!element) {
            throw new Error("TiliaLink: Target element is required");
        }
        this.element = element;
    }
    /**
     * Listen for a message from the Host.
     * handler receives (detail, done) where done is the callback provided by the sender, or a no-op.
     */
    on(eventName, handler) {
        this.element.addEventListener(`${this.prefix}${eventName}`, (e) => {
            const detail = e.detail || {};
            const done = detail._done || (() => { });
            handler(detail, done);
        });
    }
    /**
     * Send a message to the Host.
     * Optional callback will be delivered to the handler as `done`.
     */
    emit(eventName, detail = {}, callback = null) {
        const eventDetail = { ...detail };
        if (callback)
            eventDetail._done = callback;
        const event = new CustomEvent(`${this.prefix}${eventName}`, {
            detail: eventDetail,
            bubbles: true,
            composed: true
        });
        this.element.dispatchEvent(event);
    }
    /**
     * Synchronous access to configurations stored on the element by the host
     */
    getGameConfigs() {
        return this.element._tiliaConfigs || null;
    }
    // --- Convenience Shortcuts (Client → Host) ---
    onStart(handler) { this.on('host:start', handler); }
    onPause(handler) { this.on('host:pause', handler); }
    onResume(handler) { this.on('host:resume', handler); }
    /**
     * Register a config validator.
     * handler receives (configs, done) where done is called as:
     *   done(true)              — configs are valid
     *   done(false, messages)   — configs are invalid, messages is optional
     */
    onValidateConfigs(handler) {
        this.on('host:validate-configs', handler);
    }
    emitReady(data = {}, done) { this.emit('game:ready', data, done || null); }
    emitData(type, data = {}) {
        if (!type)
            throw new Error("TiliaLink: emitData requires a type");
        this.emit('game:data', { type, ...data });
    }
    emitDataFlush(data = {}, done) { this.emit('game:data-flush', data, done || null); }
    emitLevelComplete(data = {}, done) { this.emit('game:level-complete', data, done || null); }
    emitGameEnd(data = {}, done) { this.emit('game:game-end', data, done || null); }
}
/**
 * The Host-side Link (Used by TiliaLab Page)
 */
class TiliaLinkHost {
    element;
    prefix = 'tilia:';
    constructor(element) {
        this.element = element;
    }
    /**
     * Listen for a message from the Game.
     * handler receives (detail, done) where done is the callback provided by the sender, or a no-op.
     */
    on(eventName, handler) {
        this.element.addEventListener(`${this.prefix}${eventName}`, (e) => {
            const detail = e.detail || {};
            const done = detail._done || (() => { });
            handler(detail, done);
        });
    }
    /**
     * Send a message to the Game.
     * Optional callback will be delivered to the handler as `done`.
     */
    emit(eventName, detail = {}, callback = null) {
        const eventDetail = { ...detail };
        if (callback)
            eventDetail._done = callback;
        const event = new CustomEvent(`${this.prefix}${eventName}`, {
            detail: eventDetail,
        });
        this.element.dispatchEvent(event);
    }
    /**
     * Store configurations synchronously on the element and notify any listeners
     */
    setConfigs(configs) {
        this.element._tiliaConfigs = configs;
        this.emit('host:configs-updated', configs);
    }
    // --- Convenience Shortcuts (Host → Game) ---
    sendStart(config) { this.emit('host:start', config); }
    sendPause() { this.emit('host:pause'); }
    sendResume() { this.emit('host:resume'); }
    // --- Convenience Shortcuts (Host listens for Game events) ---
    onReady(handler) { this.on('game:ready', handler); }
    onData(handler) { this.on('game:data', handler); }
    onDataFlush(handler) { this.on('game:data-flush', handler); }
    onLevelComplete(handler) { this.on('game:level-complete', handler); }
    onGameEnd(handler) { this.on('game:game-end', handler); }
    /**
     * Ask the game to validate the given configs.
     * The game calls done(true) or done(false, messages).
     */
    validateConfigs(configs, done) {
        this.element._tiliaConfigs = configs;
        this.emit('host:validate-configs', configs, done);
    }
}

export { TiliaLinkClient, TiliaLinkHost };
//# sourceMappingURL=tilia-link.esm.js.map
