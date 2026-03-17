import { expect, test, describe, beforeAll } from "bun:test";
import { TiliaLinkClient, TiliaLinkHost } from "./src/index";
import { JSDOM } from "jsdom";

describe("TiliaLink", () => {
  let element: HTMLElement;

  beforeAll(() => {
    const dom = new JSDOM('<!DOCTYPE html><div id="game"></div>');
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.CustomEvent = dom.window.CustomEvent;
    element = document.getElementById("game")!;
  });

  test("Client should emit and Host should receive", (done) => {
    const host = new TiliaLinkHost(element);
    const client = new TiliaLinkClient(element);

    host.on("game:data", (data) => {
      expect(data.score).toBe(100);
      done();
    });

    client.emitData({ score: 100 });
  });

  test("Host should emit and Client should receive", (done) => {
    const host = new TiliaLinkHost(element);
    const client = new TiliaLinkClient(element);

    client.onStart((config) => {
      expect(config.theme).toBe("dark");
      done();
    });

    host.sendStart({ theme: "dark" });
  });

  test("Callback pattern: client emits with done, host calls done", (done) => {
    const host = new TiliaLinkHost(element);
    const client = new TiliaLinkClient(element);

    host.onLevelComplete((data, hostDone) => {
      expect(data.level).toBe(3);
      hostDone({ answers: "ok" });
    });

    client.emitLevelComplete({ level: 3 }, (result: any) => {
      expect(result.answers).toBe("ok");
      done();
    });
  });

  test("game:ready shortcut with callback", (done) => {
    const host = new TiliaLinkHost(element);
    const client = new TiliaLinkClient(element);

    host.onReady((data, hostDone) => {
      hostDone();
    });

    client.emitReady({}, () => {
      done();
    });
  });

  test("Fire-and-forget: handler gets no-op done", (done) => {
    const host = new TiliaLinkHost(element);
    const client = new TiliaLinkClient(element);

    host.on("game:data", (data, hostDone) => {
      expect(typeof hostDone).toBe("function");
      hostDone(); // should be a no-op, no error
      done();
    });

    client.emitData({ score: 42 });
  });
});
