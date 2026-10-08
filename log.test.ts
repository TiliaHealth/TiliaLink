import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { TiliaLinkClient, TiliaLinkHost } from "./src/index";
import { bindTiliaLink } from "./src/bind";
import { logError } from "./src/log";
import { JSDOM } from "jsdom";

function createElement(id: string): HTMLElement {
  const dom = new JSDOM(`<!DOCTYPE html><div id="${id}"></div>`);
  global.document = dom.window.document as any;
  global.HTMLElement = dom.window.HTMLElement as any;
  global.CustomEvent = dom.window.CustomEvent as any;
  return document.getElementById(id)!;
}

describe("error logging", () => {
  const originalError = console.error;
  let printed: any[][];

  beforeEach(() => {
    printed = [];
    console.error = (...args: any[]) => { printed.push(args); };
    bindTiliaLink(null);
  });

  afterEach(() => {
    console.error = originalError;
    bindTiliaLink(null);
  });

  it("logError with no client bound writes console.error only", () => {
    logError("menu_click_before_start", { button: "play" });
    assert.deepStrictEqual(printed, [["TiliaLink:", "menu_click_before_start", { button: "play" }]]);
  });

  it("logError with a client bound writes console.error and a data row", () => {
    const el = createElement("game");
    const rows: any[] = [];
    new TiliaLinkHost(el).onData((row) => rows.push(row));
    bindTiliaLink(new TiliaLinkClient(el));

    logError("menu_click_before_start", { button: "play" });

    assert.deepStrictEqual(printed, [["TiliaLink:", "menu_click_before_start", { button: "play" }]]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].type, "menu_click_before_start");
    assert.strictEqual(rows[0].button, "play");
  });

  it("emitError on the client does the same without binding", () => {
    const el = createElement("game");
    const rows: any[] = [];
    new TiliaLinkHost(el).onData((row) => rows.push(row));

    new TiliaLinkClient(el).emitError("config_invalid", { key: "seed" });

    assert.strictEqual(printed.length, 1);
    assert.strictEqual(rows[0].type, "config_invalid");
    assert.strictEqual(rows[0].key, "seed");
  });
});
