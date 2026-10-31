# Dunk & Drop

A single-file HTML5 physics arcade shooter. Drag the ball back, release, and swish it through moving and obstacle-shielded hoops.

- **Play:** open `index.html` in a browser (no build step, no dependencies).
- **Controls:** drag the ball back and release (touch or mouse). Keyboard: arrow keys to aim, Space to shoot, `P`/`Esc` to pause.
- **Scoring:** clean swish +2 (consecutive swishes multiply up to x5), rim-touching basket +1. A basket restores a ball (max 5), a miss costs one.

## Deployment

`.github/workflows/deploy.yml` deploys to Vercel **production only** on every push to `main`, then deletes all previous deployments once the new one is live.
Required repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
Vercel's own Git integration is disabled in `vercel.json` so no preview deployments are created.
