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
    /**
     * Synchronous access to translated strings stored on the element by the host.
     * Returns a {key: translatedText} map, or empty object if none set.
     */
    getStrings() {
        return this.element._tiliaStrings || {};
    }
    /**
     * Get a single translated string by key.
     * Returns the translated string, or empty string if not found.
     */
    getString(key) {
        const strings = this.element._tiliaStrings || {};
        return strings[key] || "";
    }
    /**
     * Request translation for keys not pre-set by the host.
     * The host resolves them and calls callback with a {key: translatedText} map.
     */
    requestStrings(keys, callback) {
        this.emit('game:strings-request', { keys }, callback);
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
    callModal(name, contents = {}, opts = {}) {
        const registry = this.element._tiliaModals || {};
        const renderer = registry[name];
        if (typeof renderer !== 'function') {
            this.emitData('modal-skipped', { modal: name, reason: 'no-handler' });
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            let settled = false;
            const done = (result = null) => {
                if (settled)
                    return;
                settled = true;
                resolve(result);
            };
            if (opts.timeoutMs) {
                setTimeout(() => {
                    if (settled)
                        return;
                    this.emitData('modal-timeout', { modal: name });
                    done(null);
                }, opts.timeoutMs);
            }
            renderer(contents, done);
        });
    }
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
    /**
     * Store translated strings on the element for synchronous access by the client.
     */
    setStrings(strings) {
        this.element._tiliaStrings = strings;
    }
    /**
     * Register a handler for when the client requests unknown string keys.
     * handler receives (keys: string[], done: (resolved: Record<string, string>) => void)
     */
    onStringsRequest(handler) {
        this.on('game:strings-request', (detail, done) => {
            const keys = detail.keys || [];
            handler(keys, done);
        });
    }
    // --- Convenience Shortcuts (Host → Game) ---
    sendStart(config) { this.emit('host:start', config); }
    sendPause() { this.emit('host:pause'); }
    sendResume() { this.emit('host:resume'); }
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
    onModal(name, renderer) {
        const el = this.element;
        if (!el._tiliaModals)
            el._tiliaModals = {};
        el._tiliaModals[name] = renderer;
    }
    /**
     * Unregister a named modal renderer.
     */
    offModal(name) {
        const el = this.element;
        if (el._tiliaModals)
            delete el._tiliaModals[name];
    }
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
