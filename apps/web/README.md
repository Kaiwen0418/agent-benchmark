# Web Playground

This app is now oriented around a single-page interactive AI playground.

## Product Shape

The homepage is the product:

- hero
- run playground
- replay gallery
- docs

The core interaction is:

- input agent endpoint
- click start
- watch a live mock run

## Current Mode

P0 is experience-first. The app uses a local fake run system driven by Zustand so the team can tune pacing, observability, and visual language before wiring real backend infrastructure.

## Next Recommended Steps

1. Tune the fake run pacing until the viewing experience feels sharp.
2. Replace local mock state with real event polling from the run APIs.
3. Reuse the live Mac container for a real noVNC or browser stream.
4. Connect Supabase only after the homepage interaction feels compelling.
