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
---

4. Shared game-side helpers

The bridge classes are the point of this package, but two things every game needs
were being copy-pasted per repo and drifting (seven copies of the string wrapper,
eight of the display units, no two identical). They live here now. Both are
engine-agnostic — plain web tech, no Phaser — which is the test for whether
something belongs in TiliaLink at all. Anything that talks to a game engine stays
in the game; `template-phaserio-game` is the reference copy for that half.

`_t` / `_n` / `interpolate` — gettext-shaped lookup over the client's own
`requestString` channel. The game writes English msgids at the call site; Django's
`makemessages` override extracts on the identifiers `_t` and `_n`, so the wrapper
has to keep those exact names. Bind once at boot, then call it anywhere:

```javascript
import { TiliaLinkClient, bindTiliaLink, _t, _n, interpolate } from '@tilia/tilia-link';

bindTiliaLink(new TiliaLinkClient(container));

_t('Start');                                  // "Los geht's"
_t('button', 'Start');                        // context-qualified
_n('%(n)s point', '%(n)s points', 3);         // plural form by count
interpolate(_t('%(n)s left'), { n: 3 });
```

With no client bound, or a host with no catalog, the msgid comes back unchanged —
readable English, not a missing-key marker.

`u` / `px` / `toCssPixels` / `scaleLayout` / `resolveDevicePixelScale` /
`resolveMaxTextureSize` — device-pixel rendering units. A canvas sized in CSS
pixels is blurry on a retina screen, so the backing store is sized in device
pixels with a matching inverse zoom. Author every size in CSS pixels and wrap it:

```javascript
import { bindDevicePixelScale, resolveDevicePixelScale, resolveMaxTextureSize, u, px } from '@tilia/tilia-link';

const max = resolveMaxTextureSize();
bindDevicePixelScale(resolveDevicePixelScale(window.devicePixelRatio, w, h, max));

circle.setStrokeStyle(u(3), 0x7bb3f0);
label.setFontSize(px(20));
```

`resolveMaxTextureSize` is not optional: an oversized backing store fails
silently, and Firefox with `privacy.resistFingerprinting` clamps to 2048.
Applying the scale is the engine's job and stays in the game.
