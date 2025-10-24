# PostFlyers

Anonymous location session tracker built with AWS Amplify (AppSync + DynamoDB) and a React PWA client delivered via Vite.

## Structure

- `frontend/` – Vite + React application that captures location tracks and replays shared sessions on a MapLibre map.
- `amplify/` – Amplify backend resources (AppSync API, DynamoDB tables, Cognito identity/user pools).
- `src/` – Amplify generated JavaScript helpers (`aws-exports`, GraphQL operations) for integration outside the frontend bundle.

## Getting started

1. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Launch the dev server:
   ```bash
   npm run dev
   ```
3. Build for production (type-checks included):
   ```bash
   npm run build
   ```

## Amplify backend

- The included Amplify backend targets the `postflyers` AppSync API with IAM as the default auth mode. Guest access relies on the unauthenticated Cognito identity role.
- After adjusting any backend resources run:
  ```bash
  amplify push
  ```
  to provision the updated schema/resolvers in AWS. The current repo state assumes you are working in the `dev` environment that has already been bootstrapped.

## Frontend configuration

All AWS connection details are sourced from `frontend/src/aws-exports.(js|ts)` and `frontend/src/amplifyconfiguration.json`, which mirror the values under `src/`. If you re-run `amplify pull` or `amplify push`, regenerate these artifacts and ensure the frontend copies stay in sync.
