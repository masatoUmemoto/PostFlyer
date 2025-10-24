# PostFlyers PWA (frontend)

Progressive web application for collecting anonymous GPS tracks and replaying shared activity on a MapLibre map. Built with React + Vite and integrates with AWS Amplify (AppSync + DynamoDB).

## Scripts

- `npm run dev` – start the Vite dev server
- `npm run build` – type-check and create an optimized production build
- `npm run preview` – preview the production build locally
- `npm run lint` – run ESLint on the project

## Environment variables

Create `frontend/.env` (or `.env.local`) and populate:

```
VITE_AWS_REGION=ap-northeast-1
VITE_APPSYNC_URL=https://<your-appsync-endpoint>.appsync-api.ap-northeast-1.amazonaws.com/graphql
VITE_COGNITO_IDENTITY_POOL_ID=ap-northeast-1:<identity-pool-id>
```

The concrete values should match those in `frontend/src/aws-exports.ts`, which mirrors the Amplify outputs for the current environment.

## Amplify integration quick steps

1. `amplify init`
2. `amplify pull` (or `amplify push` after local edits) to sync the backend defined under `../amplify`.
3. Replace or update the generated `aws-exports` artifacts under `frontend/src/` so they align with the deployed environment.

## Feature overview

- Nickname prompt with local device ID persistence
- Continuous geolocation capture with 15-second bulk flushes to AppSync
- Live polling view of other participants within a configurable window
- Manual history query with time-range playback overlay
- MapLibre visualization with self path, peer tracks, and playback markers
- PWA ready (installable, offline-first shell)

## Technical notes

- Geolocation buffering handled via `useTrackRecorder` (in-memory; ready for future IndexedDB storage)
- GraphQL interactions encapsulated in `src/services/appsyncService.ts`
- Map rendering handled by `src/components/MapView.tsx` using dedicated sources/layers
- Service worker & manifest provided by `vite-plugin-pwa`
