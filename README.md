# TiliaLink SDK
Use this to communicate with TiliaHealth backend through the webpage hosted on TiliaHealth servers.
To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.js
```

This project was created using `bun init` in bun v1.3.10. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

---

1. The Core Architecture 

* The Bridge: All messages are dispatched and heard on the game container DOM element (e.g., `<div
    id="game-container">`).
* The Prefix: Every event is prefixed with tilia: to prevent collisions with standard browser events (e.g.,
    tilia:game:data).
* The Library: tilia-link.js provides two classes: TiliaLinkHost (for the site) and TiliaLinkClient (for the
    game).

---

2. How the Game (Client) uses it 

Instead of calling window.logGameEvent(), the game initializes the SDK on its container and uses the provided
methods:

```javascript
// Initialize on the container provided by the site
const container = document.getElementById("game-container");
const tilia = new TiliaLink.TiliaLinkClient(container);

// REPLACE: window.logGameEvent(data)
tilia.emitData({ score: 100, x: 10, y: 20 });

// REPLACE: window.getGameConfig() (Now Async/Promise based!)
const levelConfig = await tilia.requestNextLevel({ currentScore: 50 });
myGame.startLevel(levelConfig);

// Listen for site commands
tilia.onPause(() => myEngine.pause());
tilia.onResume(() => myEngine.resume());
```
---


3. How the Site (Host) uses it 

The `game_tag_contract.html` template now automatically sets up a `TiliaLinkHost` on the container. It listens for
data and routes it to the backend logging systems.

```javascript

const tiliaHost = new TiliaLink.TiliaLinkHost(gameContainer);

// Listen for telemetry from any game
tiliaHost.on('game:data', (data) => {
    saveToDatabase(data);
});

// Provide data to the game when requested
tiliaHost.onRequest('host:get-next-level', async (stats) => {
    return fetch('/api/next-level-logic/');
});
```