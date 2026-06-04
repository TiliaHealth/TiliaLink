import { describe, it } from "node:test";
import assert from "node:assert";
import { TiliaLinkClient, TiliaLinkHost } from "./src/index";
import { JSDOM } from "jsdom";

function createElement(id: string = "game"): HTMLElement {
  const dom = new JSDOM(`<!DOCTYPE html><div id="${id}"></div>`);
  global.document = dom.window.document as any;
  global.HTMLElement = dom.window.HTMLElement as any;
  global.CustomEvent = dom.window.CustomEvent as any;
  return document.getElementById(id)!;
}

describe("TiliaLink core", () => {
  it("Client should emit and Host should receive", (_t, done) => {
    const el = createElement("core1");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    host.on("game:data", (data: any) => {
      assert.strictEqual(data.score, 100);
      assert.strictEqual(data.type, "score-report");
      done();
    });

    client.emitData("score-report", { score: 100 });
  });

  it("Host should emit and Client should receive", (_t, done) => {
    const el = createElement("core2");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    client.onStart((config: any) => {
      assert.strictEqual(config.theme, "dark");
      done();
    });

    host.sendStart({ theme: "dark" });
  });

  it("Callback pattern: client emits with done, host calls done", (_t, done) => {
    const el = createElement("core3");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    host.onLevelComplete((data: any, hostDone: any) => {
      assert.strictEqual(data.level, 3);
      hostDone({ answers: "ok" });
    });

    client.emitLevelComplete({ level: 3 }, (result: any) => {
      assert.strictEqual(result.answers, "ok");
      done();
    });
  });

  it("game:ready shortcut with callback", (_t, done) => {
    const el = createElement("core4");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    host.onReady((_data: any, hostDone: any) => {
      hostDone();
    });

    client.emitReady({}, () => {
      done();
    });
  });

  it("validateConfigs: game validates and returns true", (_t, done) => {
    const el = createElement("core5");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    client.onValidateConfigs((configs: any, doneValidation: any) => {
      assert.strictEqual(configs.stimTime, 100);
      doneValidation(true);
    });

    host.validateConfigs({ stimTime: 100 }, (valid: boolean, messages: any) => {
      assert.strictEqual(valid, true);
      assert.strictEqual(messages, undefined);
      done();
    });
  });

  it("validateConfigs: game rejects with messages", (_t, done) => {
    const el = createElement("core6");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    client.onValidateConfigs((_configs: any, doneValidation: any) => {
      doneValidation(false, { errors: ["stimTime missing"] });
    });

    host.validateConfigs({}, (valid: boolean, messages: any) => {
      assert.strictEqual(valid, false);
      assert.ok(messages.errors.includes("stimTime missing"));
      done();
    });
  });

  it("validateConfigs: stores configs on element", (_t, done) => {
    const el = createElement("core7");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    client.onValidateConfigs((_configs: any, doneValidation: any) => {
      assert.deepStrictEqual(client.getGameConfigs(), { foo: 1 });
      doneValidation(true);
    });

    host.validateConfigs({ foo: 1 }, (valid: boolean) => {
      assert.strictEqual(valid, true);
      done();
    });
  });

  it("Fire-and-forget: handler gets no-op done", (_t, done) => {
    const el = createElement("core8");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    host.on("game:data", (_data: any, hostDone: any) => {
      assert.strictEqual(typeof hostDone, "function");
      hostDone();
      done();
    });

    client.emitData("score-report", { score: 42 });
  });
});

describe("TiliaLink strings API", () => {
  it("setStrings stores and getStrings retrieves", () => {
    const el = createElement("strings1");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    host.setStrings({ win: "You win!", lose: "You lose!" });

    const strings = client.getStrings();
    assert.strictEqual(strings.win, "You win!");
    assert.strictEqual(strings.lose, "You lose!");
  });

  it("getString returns single value", () => {
    const el = createElement("strings2");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    host.setStrings({ title: "Grid Game" });

    assert.strictEqual(client.getString("title"), "Grid Game");
    assert.strictEqual(client.getString("missing"), "");
  });

  it("getStrings returns empty object when nothing set", () => {
    const el = createElement("strings3");
    const client = new TiliaLinkClient(el);
    const strings = client.getStrings();
    assert.deepStrictEqual(strings, {});
  });

  it("requestStrings fires event and host resolves", (_t, done) => {
    const el = createElement("strings4");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    host.setStrings({ title: "Grid Game" });

    host.onStringsRequest((keys: string[], hostDone: any) => {
      assert.deepStrictEqual(keys, ["title", "unknown"]);
      hostDone({ title: "Grid Game", unknown: "???" });
    });

    client.requestStrings(["title", "unknown"], (resolved: any) => {
      assert.strictEqual(resolved.title, "Grid Game");
      assert.strictEqual(resolved.unknown, "???");
      done();
    });
  });

  it("setStrings overwrites previous strings", () => {
    const el = createElement("strings5");
    const host = new TiliaLinkHost(el);
    const client = new TiliaLinkClient(el);

    host.setStrings({ key: "first" });
    host.setStrings({ key: "second" });

    assert.strictEqual(client.getString("key"), "second");
  });
});
