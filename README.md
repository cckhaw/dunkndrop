# Dunk & Drop

A single-file HTML5 physics arcade shooter. Drag the ball back, release, and swish it through moving and obstacle-shielded hoops.

- **Play:** open `index.html` in a browser (no build step, no dependencies, no external assets).
- **View:** a real 3D orbit camera, starting at a 45° elevated angle off the shot line, on a half court with NBA-style markings (key, free-throw circle, restricted arc, three-point line). Rendering is a small software 3D engine on Canvas; the ball uses full 3D physics (floor, walls, glass backboard, rim torus, rotating obstacle). Each world surrounds the court on all sides.
- **Worlds:** pick one at the start screen - *Sunny Block* (neighbourhood, daytime), *Rooftop Sunset* (city skyline), *Neon Night* (floodlit street court). Best scores are saved per world.
- **Aiming:** slingshot-style from any camera angle - pull the ball back and the shot flies the opposite way as seen on screen; pull length is power. The dotted guide traces the whole flight to rim height and a ring shows where the ball will cross the rim (green = clean swish, amber = rim touch, red = miss). Release to shoot.
- **Look around:** drag the court to orbit (rotate and tilt), pinch or scroll to zoom, two fingers to pan; buttons for zoom, rotate 45° and reset (double-click also resets). Keyboard: arrows aim, Space shoots, `Q`/`E` rotate, `+`/`-` zoom, `0` reset, `P`/`Esc` pause.
- **Scoring:** clean swish +2 (consecutive swishes multiply up to x5), rim-touching basket +1. A basket restores a ball (max 5) and moves you to a new spot with a new hoop (static, sliding, bobbing or behind a spinning bar); a miss costs one ball.

## Leaderboards

Each world has its own global top 10. After a game, enter a name to submit your score; open **Leaderboards** from the start screen (or **Leaderboard** on the game-over screen) to browse the three worlds.

- **Name filter:** names are 2-14 characters (letters, numbers, spaces, `. _ -`), links are rejected, and a profanity filter (leetspeak, spacing and stretched letters are normalised) rejects bad words. The same code (`lib/profanity.js`, embedded in `index.html`) runs in the browser for instant feedback and on the server, which is authoritative. It is a blocklist, so it can't catch everything.
- **API:** `api/leaderboard.js` (Vercel Function). `GET /api/leaderboard?world=block|roof|neon` returns the top 10; `POST` with `action: "start"` hands out a signed session, and `action: "submit"` records a score.
- **Storage:** one private JSON file per world in a Vercel Blob store (`leaderboard/<world>.json`), updated with ETag-conditional writes so concurrent submissions can't overwrite each other. The store's `BLOB_READ_WRITE_TOKEN` is injected into the project; the signing secret is derived from it, so there is nothing else to configure.
- **Abuse limits (not cheat-proof, since the game runs in the browser):** a score can only be submitted with a signed session issued when that game started, once, for the same world, and not faster than 4 points per second of elapsed time; scores are capped; one row per name (best score kept); only the top 25 per world are stored.
- **Tests:** `npm test` covers the filter, the API rules and that the page's embedded filter matches the server's. CI runs it before every deploy.

## Deployment

`.github/workflows/deploy.yml` deploys to Vercel **production only** on every push to `main`, then deletes all previous deployments once the new one is live.
Required repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
Vercel's own Git integration is disabled in `vercel.json` so no preview deployments are created.
