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
let client = null;
function bindTiliaLink(tiliaLink) {
    client = tiliaLink;
}
function _t(a, b) {
    let msgid = a;
    let context;
    if (b !== undefined) {
        context = a;
        msgid = b;
    }
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

export { TiliaLinkClient, TiliaLinkHost, _n, _t, bindDevicePixelScale, bindTiliaLink, getDevicePixelScale, interpolate, px, resolveDevicePixelScale, resolveMaxTextureSize, scaleLayout, toCssPixels, u };
//# sourceMappingURL=tilia-link.esm.js.map
