/**
 * The one client the module-level helpers (`_t`, `_n`, `logError`) talk to.
 * A game binds it once in its entry point, right after constructing the
 * client and before any scene boots. Unbound, each helper has its own
 * fallback: the msgid for strings, console only for errors.
 */
let client = null;
function bindTiliaLink(tiliaLink) {
    client = tiliaLink;
}
function boundClient() {
    return client;
}

function _t(a, b) {
    let msgid = a;
    let context;
    if (b !== undefined) {
        context = a;
        msgid = b;
    }
    const client = boundClient();
    if (!client)
        return msgid;
    let resolved = msgid;
    client.requestString({ msgid, context }, (text) => {
        resolved = text;
    });
    return resolved;
}
function _n(a, b, c, d) {
    let context;
    let singular = a;
    let plural = b;
    let count = c;
    if (d !== undefined) {
        context = a;
        singular = b;
        plural = c;
        count = d;
    }
    let fallback = plural;
    if (count === 1)
        fallback = singular;
    const client = boundClient();
    if (!client)
        return fallback;
    let resolved = fallback;
    client.requestString({ msgid: singular, context, plural, count }, (text) => {
        resolved = text;
    });
    return resolved;
}
/**
 * Django-style named interpolation. An unknown name is left as literal text
 * rather than becoming "undefined", so a typo ships as a visible `%(name)s`
 * that check_game_i18n's placeholder pass can catch.
 */
function interpolate(fmt, values) {
    return fmt.replace(/%\((\w+)\)s/g, function (match, name) {
        if (!(name in values))
            return match;
        return String(values[name]);
    });
}

/**
 * Error reporting a game can call from any module, bound or not.
 *
 * Games may not touch `console` (template-phaserio-game
 * Rules/no-dom-and-globals.md), so the SDK does it for them: every call writes
 * a `console.error`. Once a client is bound the error also goes out through
 * `emitError` as a `game:error` event, so the host can record it instead of
 * it ending in a devtools panel nobody has open on a participant's phone.
 */
function logError(type, data = {}) {
    const client = boundClient();
    if (client) {
        client.emitError(type, data);
        return;
    }
    console.error('TiliaLink:', type, data);
}

/**
 * Device-pixel rendering units.
 *
 * A canvas sized in CSS pixels holds a fraction of the pixels a retina screen
 * has and the compositor smears each one. The fix is to size the backing store
 * in device pixels and apply a matching inverse zoom, which leaves the CSS
 * footprint unchanged. The engine then works in device pixels, and every size
 * a game authors has to be converted — hence `u()` and `px()`.
 *
 * **Author every size in CSS pixels and wrap it in u() or px().** A CSS pixel
 * is the device-independent unit, so u(12) is the same physical size on every
 * screen and only the number of device pixels behind it changes. That holds
 * even when the GL context limits the scale: the limit trades sharpness, never
 * size.
 *
 * This is plain arithmetic and one WebGL probe — no engine. Applying the scale
 * is the engine's job and stays in the game (Phaser: a Scale.NONE canvas whose
 * size and zoom are re-set on resize; see template-phaserio-game's
 * `syncGameSize`, and phaser-catchthedrop for the fixed-design-resolution
 * variant that pins the world at the boot scale and moves only the zoom).
 */
let deviceScale = 1;
/**
 * The device's full ratio, limited only by what the GL context will allocate.
 *
 * The backing store cannot exceed MAX_TEXTURE_SIZE or MAX_RENDERBUFFER_SIZE,
 * because boot-time render targets are single full-canvas textures with no
 * mosaic path. Exceeding it fails silently — the texture gets no storage and
 * WebGL reports "Framebuffer status: Incomplete Attachment".
 *
 * Limits as low as 2048 are real: Firefox with privacy.resistFingerprinting
 * clamps to exactly that and enforces it. A large window can then exceed the
 * limit even at ratio 1, so the scale may fall below 1 — soft, but running.
 *
 * Both axes are checked separately, because a tall portrait window blows the
 * height limit while its width is still fine.
 */
function resolveDevicePixelScale(ratio, width, height, maxDimension) {
    const requested = ratio || 1;
    if (!maxDimension || !width || !height) {
        return requested;
    }
    return Math.min(requested, maxDimension / width, maxDimension / height);
}
/** Largest render target this context will allocate, or 0 with no GL context. */
function resolveMaxTextureSize() {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) {
        return 0;
    }
    const limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return limit;
}
function bindDevicePixelScale(value) {
    deviceScale = value;
}
function getDevicePixelScale() {
    return deviceScale;
}
/** CSS pixels to world units. Use for every radius, gap, stroke and offset. */
function u(cssPixels) {
    return cssPixels * deviceScale;
}
/** CSS pixels to a font-size string. */
function px(cssPixels) {
    return Math.round(cssPixels * deviceScale) + 'px';
}
/**
 * World units back to CSS pixels. Telemetry goes through this: a world
 * measurement logged raw is in device pixels and so varies with the
 * participant's screen, which stops the same task comparing across sessions.
 */
function toCssPixels(worldUnits) {
    return worldUnits / deviceScale;
}
/**
 * For layout objects authored in CSS pixels — breakpoints describe device
 * classes, which are a CSS-pixel concept — converts every numeric value to
 * world units in one place rather than at every use site.
 */
function scaleLayout(layout) {
    const scaled = {};
    for (const key of Object.keys(layout)) {
        const value = layout[key];
        if (typeof value === 'number') {
            scaled[key] = value * deviceScale;
            continue;
        }
        scaled[key] = value;
    }
    return scaled;
}

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
    requestString(query, callback) {
        this.emit('game:string-request', { ...query }, callback);
    }
    // --- Convenience Shortcuts (Client → Host) ---
    /**
     * The host's start signal. It carries no payload: every configuration value
     * travels through setConfigs() / getGameConfigs() and is in place before
     * the game emits game:ready. A handler that wants tuning reads it there.
     */
    onStart(handler) { this.on('host:start', () => handler()); }
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
    /**
     * Announce that the bundle has booted and the game is mounted.
     *
     * OPTIONAL. The host does not block on it; it is a diagnostic marker that
     * separates "never loaded" from "loaded and then went quiet" when a session
     * arrives empty.
     */
    emitReady(data = {}, done) { this.emit('game:ready', data, done || null); }
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
    emitData(type, data = {}) {
        if (!type)
            throw new Error("TiliaLink: emitData requires a type");
        this.emit('game:data', { type, ...data });
    }
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
    emitError(type, data = {}) {
        console.error('TiliaLink:', type, data);
        this.emit('game:error', { type, ...data });
    }
    emitDataFlush(data = {}, done) { this.emit('game:data-flush', data, done || null); }
    /**
     * Report that a level finished.
     *
     * OPTIONAL progress telemetry. It is not a gate: the host does not count
     * these or decide the session is over from them. Level results that matter
     * analytically belong in `emitData` rows; this is a coarse progress ping on
     * top of those.
     */
    emitLevelComplete(data = {}, done) { this.emit('game:level-complete', data, done || null); }
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
    /**
     * Register the resolver for single-msgid translation requests.
     * handler receives ({msgid, context}, done) and must call done(text).
     *
     * One generic handler serves every game: context travels in the query from
     * the game source, so the host never enumerates a game's strings.
     */
    onStringRequest(handler) {
        this.on('game:string-request', (detail, done) => {
            handler({
                msgid: detail.msgid,
                context: detail.context,
                plural: detail.plural,
                count: detail.count,
            }, done);
        });
    }
    // --- Convenience Shortcuts (Host → Game) ---
    /**
     * Bare start signal. Deliberately takes no argument: tuning must be set
     * with setConfigs() before this, never smuggled in on the start event.
     */
    sendStart() { this.emit('host:start'); }
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

export { TiliaLinkClient, TiliaLinkHost, _n, _t, bindDevicePixelScale, bindTiliaLink, getDevicePixelScale, interpolate, logError, px, resolveDevicePixelScale, resolveMaxTextureSize, scaleLayout, toCssPixels, u };
//# sourceMappingURL=tilia-link.esm.js.map
