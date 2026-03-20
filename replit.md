# Initiative Tracker — Workspace

## Overview

Full-stack Initiative Tracker built on a pnpm monorepo. Features Replit Auth (OIDC with PKCE), three user roles (admin, project-manager, approver), milestone-based progress tracking (`calcProgress`), file uploads via Replit Object Storage, and a React + Vite frontend.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Replit Auth (OIDC/PKCE) via `openid-client` v6 on server; `@workspace/replit-auth-web` on frontend
- **Object storage**: Replit Object Storage (GCS-backed) — presigned URL upload flow
- **Frontend**: React 18 + Vite, Tailwind CSS v4, TanStack Query, Wouter, Radix UI, Framer Motion, Sonner
- **Validation**: Zod (v3 catalog), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle for api-server)

## Roles

- `admin` — full access, role management
- `project-manager` — create/manage their own initiatives and milestones, submit for approval
- `approver` — approve or reject submitted milestones

Default role for new users: `project-manager`

## calcProgress Logic

Progress = (sum of approved milestone weights / sum of all milestone weights) × 100

Implemented server-side in `artifacts/api-server/src/routes/initiatives.ts`.

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/            # Express 5 API server (port from $PORT env, default 8080)
│   └── initiative-tracker/    # React + Vite frontend (port from $PORT env)
├── lib/
│   ├── api-spec/              # OpenAPI 3.1 spec + Orval codegen config
│   ├── api-client-react/      # Generated React Query hooks + custom fetch (credentials: include)
│   ├── api-zod/               # Generated Zod schemas
│   ├── db/                    # Drizzle ORM schema + DB connection
│   ├── replit-auth-web/       # useAuth() hook for React frontend
│   └── object-storage-web/    # File upload utilities (Uppy-based)
├── scripts/                   # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json              # Root TS project references
└── package.json
```

## DB Schema

- `users` — id (Replit sub), email, firstName, lastName, profileImageUrl, role (admin|project-manager|approver), createdAt/updatedAt
- `sessions` — id (UUID), data (JSONB), expiresAt
- `initiatives` — id, title, description, status, priority, ownerId (→ users), startDate, targetDate, createdAt/updatedAt
- `milestones` — id, initiativeId, title, description, status (pending|in_progress|submitted|approved|rejected), weight (numeric), dueDate, approvedById, approvedAt, rejectionReason, createdAt/updatedAt
- `approvals` — id, milestoneId, reviewerId (→ users), action (approved|rejected), comment, createdAt — full approval history
- `upload_intents` — id, userId, milestoneId, objectPath, expiresAt, usedAt, createdAt — upload intent binding (prevents path spoofing)
- `file_attachments` — id, milestoneId, uploadedById, fileName, objectPath, contentType, createdAt

## User Management

Users are provisioned automatically via Replit OIDC on first login. Admins can update roles via the Admin panel (`PUT /api/users/:id/role`). **User creation and deletion are not supported** — this is an intentional product decision: since all users are OIDC-provisioned by Replit Auth, admin responsibility is limited to role assignment only.

## API Routes (all under `/api`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /auth/user | Get current user |
| GET | /login | Start OIDC login |
| GET | /callback | OIDC callback |
| GET | /logout | Logout |
| POST | /mobile-auth/token | Mobile token exchange |
| GET | /initiatives | List all initiatives (with progress) |
| POST | /initiatives | Create initiative (admin/PM only) |
| GET | /initiatives/:id | Get initiative detail + milestones |
| PUT | /initiatives/:id | Update initiative |
| DELETE | /initiatives/:id | Delete initiative |
| POST | /initiatives/:id/milestones | Create milestone |
| PUT | /milestones/:id | Update milestone |
| DELETE | /milestones/:id | Delete milestone |
| POST | /milestones/:id/submit | Submit for approval |
| POST | /milestones/:id/approve | Approve milestone (admin/approver) |
| POST | /milestones/:id/reject | Reject milestone (admin/approver) |
| POST | /milestones/:id/attachments | Add file attachment |
| GET | /users | List all users (admin only) |
| PUT | /users/:id/role | Update user role (admin only) |
| POST | /storage/uploads/request-url | Request presigned upload URL (auth + milestone ownership required) |
| GET | /storage/objects/* | Serve private attachment (auth + role/ownership check via DB) |

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — no JS emit during typecheck; bundling via esbuild/tsx/vite

## Root Scripts

- `pnpm run build` — typecheck then recursive build
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`

## Development

- API server: `pnpm --filter @workspace/api-server run dev` (port 8080)
- Frontend: `pnpm --filter @workspace/initiative-tracker run dev`
- DB push: `pnpm --filter @workspace/db run push`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
