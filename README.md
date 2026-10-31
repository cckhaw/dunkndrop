# Dunk & Drop

A single-file HTML5 physics arcade shooter. Drag the ball back, release, and swish it through moving and obstacle-shielded hoops.

- **Play:** open `index.html` in a browser (no build step, no dependencies, no external assets).
- **View:** a real 3D orbit camera, starting at a 45° elevated angle off the shot line, on a half court with NBA-style markings (key, free-throw circle, restricted arc, three-point line). Rendering is a small software 3D engine on Canvas; the ball uses full 3D physics (floor, walls, glass backboard, rim torus, rotating obstacle). Each world surrounds the court on all sides.
- **Worlds:** pick one at the start screen - *Sunny Block* (neighbourhood, daytime), *Rooftop Sunset* (city skyline), *Neon Night* (floodlit street court). Best scores are saved per world.
- **Aiming:** slingshot-style from any camera angle - pull the ball back and the shot flies the opposite way as seen on screen; pull length is power. The dotted guide traces the whole flight to rim height and a ring shows where the ball will cross the rim (green = clean swish, amber = rim touch, red = miss). Release to shoot.
- **Look around:** drag the court to orbit (rotate and tilt), pinch or scroll to zoom, two fingers to pan; buttons for zoom, rotate 45° and reset (double-click also resets). Keyboard: arrows aim, Space shoots, `Q`/`E` rotate, `+`/`-` zoom, `0` reset, `P`/`Esc` pause.
- **Scoring:** clean swish +2 (consecutive swishes multiply up to x5), rim-touching basket +1. A basket restores a ball (max 5) and moves you to a new spot with a new hoop (static, sliding, bobbing or behind a spinning bar); a miss costs one ball.

## Deployment

`.github/workflows/deploy.yml` deploys to Vercel **production only** on every push to `main`, then deletes all previous deployments once the new one is live.
Required repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
Vercel's own Git integration is disabled in `vercel.json` so no preview deployments are created.
