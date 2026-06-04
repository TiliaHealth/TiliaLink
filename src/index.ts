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
export class TiliaLinkClient {
  private element: HTMLElement;
  private prefix = 'tilia:';

  constructor(element: HTMLElement) {
    if (!element) {
        throw new Error("TiliaLink: Target element is required");
    }
    this.element = element;
  }

  /**
   * Listen for a message from the Host.
   * handler receives (detail, done) where done is the callback provided by the sender, or a no-op.
   */
  on(eventName: string, handler: TiliaEventHandler) {
    this.element.addEventListener(`${this.prefix}${eventName}`, (e: any) => {
      const detail = e.detail || {};
      const done: TiliaDoneCallback = detail._done || (() => {});
      handler(detail, done);
    });
  }

  /**
   * Send a message to the Host.
   * Optional callback will be delivered to the handler as `done`.
   */
  emit(eventName: string, detail: TiliaEventPayload = {}, callback: TiliaDoneCallback | null = null) {
    const eventDetail = { ...detail };
    if (callback) eventDetail._done = callback;
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
  getGameConfigs<TSession = Record<string, unknown>>(): TiliaGameConfigs<TSession> | null {
    return (this.element as any)._tiliaConfigs || null;
  }

  /**
   * Synchronous access to translated strings stored on the element by the host.
   * Returns a {key: translatedText} map, or empty object if none set.
   */
  getStrings(): Record<string, string> {
    return (this.element as any)._tiliaStrings || {};
  }

  /**
   * Get a single translated string by key.
   * Returns the translated string, or empty string if not found.
   */
  getString(key: string): string {
    const strings = (this.element as any)._tiliaStrings || {};
    return strings[key] || "";
  }

  /**
   * Request translation for keys not pre-set by the host.
   * The host resolves them and calls callback with a {key: translatedText} map.
   */
  requestStrings(keys: string[], callback: TiliaDoneCallback) {
    this.emit('game:strings-request', { keys }, callback);
  }

  // --- Convenience Shortcuts (Client → Host) ---

  onStart(handler: TiliaEventHandler) { this.on('host:start', handler); }
  onPause(handler: TiliaEventHandler) { this.on('host:pause', handler); }
  onResume(handler: TiliaEventHandler) { this.on('host:resume', handler); }
  /**
   * Register a config validator.
   * handler receives (configs, done) where done is called as:
   *   done(true)              — configs are valid
   *   done(false, messages)   — configs are invalid, messages is optional
   */
  onValidateConfigs(handler: (configs: any, done: (valid: boolean, messages?: any) => void) => void) {
    this.on('host:validate-configs', handler as TiliaEventHandler);
  }

  emitReady(data: TiliaEventPayload = {}, done?: TiliaDoneCallback) { this.emit('game:ready', data, done || null); }
  emitData(type: string, data: TiliaEventPayload = {}) {
    if (!type) throw new Error("TiliaLink: emitData requires a type");
    this.emit('game:data', { type, ...data });
  }
  emitDataFlush(data: TiliaEventPayload = {}, done?: TiliaDoneCallback) { this.emit('game:data-flush', data, done || null); }
  emitLevelComplete(data: TiliaEventPayload = {}, done?: TiliaDoneCallback) { this.emit('game:level-complete', data, done || null); }
  emitGameEnd(data: TiliaEventPayload = {}, done?: TiliaDoneCallback) { this.emit('game:game-end', data, done || null); }
}

/**
 * The Host-side Link (Used by TiliaLab Page)
 */
export class TiliaLinkHost {
    private element: HTMLElement;
    private prefix = 'tilia:';

    constructor(element: HTMLElement) {
      this.element = element;
    }

    /**
     * Listen for a message from the Game.
     * handler receives (detail, done) where done is the callback provided by the sender, or a no-op.
     */
    on(eventName: string, handler: TiliaEventHandler) {
      this.element.addEventListener(`${this.prefix}${eventName}`, (e: any) => {
        const detail = e.detail || {};
        const done: TiliaDoneCallback = detail._done || (() => {});
        handler(detail, done);
      });
    }

    /**
     * Send a message to the Game.
     * Optional callback will be delivered to the handler as `done`.
     */
    emit(eventName: string, detail: TiliaEventPayload = {}, callback: TiliaDoneCallback | null = null) {
      const eventDetail = { ...detail };
      if (callback) eventDetail._done = callback;
      const event = new CustomEvent(`${this.prefix}${eventName}`, {
        detail: eventDetail,
      });
      this.element.dispatchEvent(event);
    }

    /**
     * Store configurations synchronously on the element and notify any listeners
     */
    setConfigs(configs: TiliaGameConfigs) {
      (this.element as any)._tiliaConfigs = configs;
      this.emit('host:configs-updated', configs);
    }

    /**
     * Store translated strings on the element for synchronous access by the client.
     */
    setStrings(strings: Record<string, string>) {
      (this.element as any)._tiliaStrings = strings;
    }

    /**
     * Register a handler for when the client requests unknown string keys.
     * handler receives (keys: string[], done: (resolved: Record<string, string>) => void)
     */
    onStringsRequest(handler: (keys: string[], done: (resolved: Record<string, string>) => void) => void) {
      this.on('game:strings-request', (detail: any, done: TiliaDoneCallback) => {
        const keys = detail.keys || [];
        handler(keys, done);
      });
    }

    // --- Convenience Shortcuts (Host → Game) ---

    sendStart(config: TiliaEventPayload) { this.emit('host:start', config); }
    sendPause() { this.emit('host:pause'); }
    sendResume() { this.emit('host:resume'); }

    // --- Convenience Shortcuts (Host listens for Game events) ---

    onReady(handler: TiliaEventHandler) { this.on('game:ready', handler); }
    onData(handler: TiliaEventHandler) { this.on('game:data', handler); }
    onDataFlush(handler: TiliaEventHandler) { this.on('game:data-flush', handler); }
    onLevelComplete(handler: TiliaEventHandler) { this.on('game:level-complete', handler); }
    onGameEnd(handler: TiliaEventHandler) { this.on('game:game-end', handler); }

    /**
     * Ask the game to validate the given configs.
     * The game calls done(true) or done(false, messages).
     */
    validateConfigs(configs: any, done: (valid: boolean, messages?: any) => void) {
      (this.element as any)._tiliaConfigs = configs;
      this.emit('host:validate-configs', configs, done);
    }
}
