import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { TiliaLinkClient, TiliaLinkHost } from "./src/index";
import { bindTiliaLink, _t, _n, interpolate } from "./src/i18n";
import { JSDOM } from "jsdom";

function createElement(id: string): HTMLElement {
  const dom = new JSDOM(`<!DOCTYPE html><div id="${id}"></div>`);
  global.document = dom.window.document as any;
  global.HTMLElement = dom.window.HTMLElement as any;
  global.CustomEvent = dom.window.CustomEvent as any;
  return document.getElementById(id)!;
}

/** A host that answers like Django's catalog: context-qualified, plural-aware. */
function catalogHost(el: HTMLElement) {
  const host = new TiliaLinkHost(el);
  host.onStringRequest((query, done) => {
    if (query.plural && (query.count ?? 0) !== 1) {
      done(`DE:${query.plural}`);
      return;
    }
    if (query.context) {
      done(`DE:${query.context}:${query.msgid}`);
      return;
    }
    done(`DE:${query.msgid}`);
  });
  return host;
}

describe("i18n wrapper", () => {

  beforeEach(() => {
    bindTiliaLink(null);
  });

  it("_t returns the msgid unchanged with no client bound", () => {
    assert.strictEqual(_t("Start"), "Start");
    assert.strictEqual(_t("button", "Start"), "Start");
  });

  it("_t resolves synchronously against the host catalog", () => {
    const el = createElement("i18n1");
    catalogHost(el);
    bindTiliaLink(new TiliaLinkClient(el));

    assert.strictEqual(_t("Start"), "DE:Start");
  });

  it("_t passes the context through as a separate field", () => {
    const el = createElement("i18n2");
    catalogHost(el);
    bindTiliaLink(new TiliaLinkClient(el));

    assert.strictEqual(_t("button", "Start"), "DE:button:Start");
  });

  it("_t keeps the msgid when the host has no catalog handler", () => {
    const el = createElement("i18n3");
    new TiliaLinkHost(el);
    bindTiliaLink(new TiliaLinkClient(el));

    assert.strictEqual(_t("Start"), "Start");
  });

  it("_n picks the fallback form by count with no client bound", () => {
    assert.strictEqual(_n("%(n)s point", "%(n)s points", 1), "%(n)s point");
    assert.strictEqual(_n("%(n)s point", "%(n)s points", 3), "%(n)s points");
    assert.strictEqual(_n("score", "%(n)s point", "%(n)s points", 3), "%(n)s points");
  });

  it("_n asks the host for the plural form", () => {
    const el = createElement("i18n4");
    catalogHost(el);
    bindTiliaLink(new TiliaLinkClient(el));

    assert.strictEqual(_n("%(n)s point", "%(n)s points", 1), "DE:%(n)s point");
    assert.strictEqual(_n("%(n)s point", "%(n)s points", 4), "DE:%(n)s points");
  });

  it("interpolate substitutes named placeholders", () => {
    assert.strictEqual(interpolate("%(n)s of %(total)s", { n: 2, total: 7 }), "2 of 7");
  });

  it("interpolate leaves an unknown name visible rather than undefined", () => {
    assert.strictEqual(interpolate("hi %(who)s", {}), "hi %(who)s");
  });
});
