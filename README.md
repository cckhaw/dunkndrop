# Dunk & Drop

A single-file HTML5 physics arcade shooter. Drag the ball back, release, and swish it through moving and obstacle-shielded hoops.

- **Play:** open `index.html` in a browser (no build step, no dependencies, no external assets).
- **View:** a 3D behind-the-shooter camera on a half court with NBA-style markings (key, free-throw circle, restricted arc, three-point line). Rendering is a small software 3D engine on Canvas; the ball uses full 3D physics (floor, walls, glass backboard, rim torus, rotating obstacle).
- **Worlds:** pick one at the start screen - *Sunny Block* (neighbourhood, daytime), *Rooftop Sunset* (city skyline), *Neon Night* (floodlit street court). Best scores are saved per world.
- **Controls:** drag the ball down to power up and slide sideways to aim; the dotted arc previews the shot; release to shoot (touch or mouse). Keyboard: arrow keys to aim, Space to shoot, `P`/`Esc` to pause.
- **Scoring:** clean swish +2 (consecutive swishes multiply up to x5), rim-touching basket +1. A basket restores a ball (max 5) and moves you to a new spot with a new hoop (static, sliding, bobbing or behind a spinning bar); a miss costs one ball.

## Deployment

`.github/workflows/deploy.yml` deploys to Vercel **production only** on every push to `main`, then deletes all previous deployments once the new one is live.
Required repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
Vercel's own Git integration is disabled in `vercel.json` so no preview deployments are created.
