# StrategyPMO Mobile App

React Native (Expo) mobile companion for the StrategyPMO web dashboard.

## Setup

```bash
cd artifacts/mobile-app
pnpm install
npx expo start
```

## Architecture

- **Framework:** Expo SDK 52 + React Native
- **Navigation:** Expo Router (file-based)
- **Data:** TanStack Query via @workspace/api-client-react
- **Auth:** OIDC via expo-auth-session
- **Styling:** React Native StyleSheet (NativeWind optional)

## Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Dashboard | `/` | Programme overview + KPIs |
| My Tasks | `/tasks` | Personal task list with priority groups |
| My Projects | `/projects` | PM portfolio with status cards |
| More | `/more` | KPIs, Risks, Documents, Sign Out |
| Project Detail | `/projects/[id]` | Milestones, risks, reports |
| Notifications | `/notifications` | In-app notification list |
| Login | `/(auth)/login` | OIDC sign-in |

## Shared Packages

- `@workspace/api-client-react` — API hooks (same as web)
- `@workspace/api-zod` — Validation schemas (same as web)

## Environment Variables

```
EXPO_PUBLIC_API_URL=https://pmo.example.gov.sa
EXPO_PUBLIC_OIDC_CLIENT_ID=your-client-id
```
