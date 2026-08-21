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
export function resolveDevicePixelScale(
  ratio: number,
  width: number,
  height: number,
  maxDimension: number
): number {
  const requested = ratio || 1;

  if (!maxDimension || !width || !height) {
    return requested;
  }

  return Math.min(requested, maxDimension / width, maxDimension / height);
}

/** Largest render target this context will allocate, or 0 with no GL context. */
export function resolveMaxTextureSize(): number {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');

  if (!gl) {
    return 0;
  }

  const limit = Math.min(
    gl.getParameter(gl.MAX_TEXTURE_SIZE),
    gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
  );

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return limit;
}

export function bindDevicePixelScale(value: number): void {
  deviceScale = value;
}

export function getDevicePixelScale(): number {
  return deviceScale;
}

/** CSS pixels to world units. Use for every radius, gap, stroke and offset. */
export function u(cssPixels: number): number {
  return cssPixels * deviceScale;
}

/** CSS pixels to a font-size string. */
export function px(cssPixels: number): string {
  return Math.round(cssPixels * deviceScale) + 'px';
}

/**
 * World units back to CSS pixels. Telemetry goes through this: a world
 * measurement logged raw is in device pixels and so varies with the
 * participant's screen, which stops the same task comparing across sessions.
 */
export function toCssPixels(worldUnits: number): number {
  return worldUnits / deviceScale;
}

/**
 * For layout objects authored in CSS pixels — breakpoints describe device
 * classes, which are a CSS-pixel concept — converts every numeric value to
 * world units in one place rather than at every use site.
 */
export function scaleLayout<T extends Record<string, unknown>>(layout: T): T {
  const scaled: Record<string, unknown> = {};

  for (const key of Object.keys(layout)) {
    const value = layout[key];
    if (typeof value === 'number') {
      scaled[key] = value * deviceScale;
      continue;
    }
    scaled[key] = value;
  }

  return scaled as T;
}
