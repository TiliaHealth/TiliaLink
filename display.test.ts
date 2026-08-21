import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  bindDevicePixelScale,
  getDevicePixelScale,
  px,
  resolveDevicePixelScale,
  scaleLayout,
  toCssPixels,
  u,
} from "./src/display";

describe("display units", () => {

  beforeEach(() => {
    bindDevicePixelScale(1);
  });

  it("uses the full device ratio when the GL limit allows it", () => {
    assert.strictEqual(resolveDevicePixelScale(2, 800, 600, 8192), 2);
  });

  it("clamps to the widest backing store the context will allocate", () => {
    assert.strictEqual(resolveDevicePixelScale(2, 2000, 600, 2048), 1.024);
  });

  it("clamps on height too, which portrait windows hit first", () => {
    assert.strictEqual(resolveDevicePixelScale(3, 600, 1600, 2048), 1.28);
  });

  it("falls back to the ratio with no GL context to measure", () => {
    assert.strictEqual(resolveDevicePixelScale(2, 800, 600, 0), 2);
  });

  it("treats a zero ratio as 1 rather than collapsing the canvas", () => {
    assert.strictEqual(resolveDevicePixelScale(0, 800, 600, 8192), 1);
  });

  it("u scales CSS pixels by the bound scale", () => {
    bindDevicePixelScale(2);
    assert.strictEqual(u(12), 24);
    assert.strictEqual(getDevicePixelScale(), 2);
  });

  it("px rounds to a whole device pixel and keeps the unit", () => {
    bindDevicePixelScale(1.5);
    assert.strictEqual(px(11), "17px");
  });

  it("toCssPixels round-trips a world measurement for telemetry", () => {
    bindDevicePixelScale(2);
    assert.strictEqual(toCssPixels(u(40)), 40);
  });

  it("scaleLayout converts numbers and leaves everything else alone", () => {
    bindDevicePixelScale(2);
    const scaled = scaleLayout({ gap: 8, columns: 3, align: "center" });
    assert.strictEqual(scaled.gap, 16);
    assert.strictEqual(scaled.columns, 6);
    assert.strictEqual(scaled.align, "center");
  });
});
