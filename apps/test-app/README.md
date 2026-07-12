# Test App

React Native app (Expo SDK 56 · RN 0.85 · React 19.2, New Architecture) in the
iguzman monorepo. Built with [expo-router](https://docs.expo.dev/router/introduction/)
and the shared [`@repo/ui-native`](../../packages/ui-native/CLAUDE.md) component
package.

## Develop

```bash
# From the repo root:
pnpm dev --filter=test-app          # start Metro on port 8081
# then press: i (iOS sim) · a (Android) · w (web) · or scan the QR in Expo Go
```

Type-check and lint like every other workspace member:

```bash
pnpm check-types --filter=test-app
pnpm lint --filter=test-app
```

## Environment

Client env comes from `.env` (copied from `.env.example`). Only `EXPO_PUBLIC_*`
variables are exposed to the app bundle.

- `EXPO_PUBLIC_API_URL` — Django API base URL.

## Native builds (EAS)

This app is **not** Docker/Helm-deployed. Ship it with EAS:

```bash
npx eas build --profile preview --platform ios
npx eas build --profile production --platform android
```

## Notes

- Monorepo Metro config lives in `metro.config.js` (watches the workspace root,
  resolves pnpm-hoisted deps, honors package `exports`).
- If Expo package versions drift from the SDK, run `npx expo install --fix`.
