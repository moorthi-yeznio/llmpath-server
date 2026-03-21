# llmpath-server

Multi-tenant learning portal API. Manages tenants, users, roles, and audit logs. Authentication is delegated entirely to Supabase Auth — the server only verifies JWTs.

## Tech Stack

| Layer      | Technology                                         |
| ---------- | -------------------------------------------------- |
| Framework  | NestJS 11, Express 5, TypeScript 5.7               |
| Database   | PostgreSQL via Drizzle ORM 0.45                    |
| Auth       | Supabase Auth (ES256 JWKS verification via `jose`) |
| Validation | class-validator + Zod (env schema)                 |
| Logging    | Pino + nestjs-pino (JSON in prod, pretty in dev)   |
| Security   | Helmet, @nestjs/throttler (rate limiting)          |
| Testing    | Jest 30, Supertest                                 |

## Prerequisites

- Node.js 20+
- pnpm
- A [Supabase](https://supabase.com) project

## Local Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# 3. Run migrations
pnpm exec drizzle-kit migrate

# 4. Seed the first platform admin (one-time)
# Add PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD to .env, then:
pnpm run seed:platform-admin

# 5. Start the server
pnpm run start:dev
```

Server starts on `http://localhost:3000`. Swagger UI at `http://localhost:3000/api/docs`.

## Environment Variables

| Variable                    | Required | Default       | Where to find                                                                 |
| --------------------------- | -------- | ------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`                  | No       | `development` | —                                                                             |
| `PORT`                      | No       | `3000`        | —                                                                             |
| `LOG_LEVEL`                 | No       | `info`        | `trace` `debug` `info` `warn` `error` `fatal` `silent`                        |
| `CORS_ORIGINS`              | No       | _(empty)_     | Comma-separated browser origins. Mobile clients bypass CORS.                  |
| `DATABASE_URL`              | **Yes**  | —             | Supabase: Settings → Database → Connection string (Transaction pooler)        |
| `SUPABASE_URL`              | **Yes**  | —             | Supabase: Settings → API → Project URL                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes**  | —             | Supabase: Settings → API → Secret key. Server-only — never expose to clients. |

Seed-only variables (not read at runtime):

| Variable                  | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `PLATFORM_ADMIN_EMAIL`    | Email for the initial platform admin    |
| `PLATFORM_ADMIN_PASSWORD` | Password for the initial platform admin |

## Scripts

| Script                           | Purpose                                |
| -------------------------------- | -------------------------------------- |
| `pnpm start:dev`                 | Start with file watching (development) |
| `pnpm start:prod`                | Run compiled production build          |
| `pnpm build`                     | Compile TypeScript                     |
| `pnpm test`                      | Run unit tests                         |
| `pnpm test:watch`                | Run tests in watch mode                |
| `pnpm test:cov`                  | Run tests with coverage report         |
| `pnpm test:e2e`                  | Run end-to-end tests                   |
| `pnpm lint`                      | Lint (zero warnings allowed)           |
| `pnpm lint:fix`                  | Auto-fix lint issues                   |
| `pnpm format`                    | Format with Prettier                   |
| `pnpm seed:platform-admin`       | Create initial platform admin user     |
| `pnpm exec drizzle-kit migrate`  | Apply pending migrations               |
| `pnpm exec drizzle-kit generate` | Generate migration from schema diff    |

## API Overview

All routes require a Supabase `access_token` as a Bearer token unless marked **public**.

### Health

| Method | Path      | Auth   | Description            |
| ------ | --------- | ------ | ---------------------- |
| GET    | `/`       | public | Service info and links |
| GET    | `/health` | public | Liveness check         |

### Auth

| Method | Path           | Auth     | Description                                 |
| ------ | -------------- | -------- | ------------------------------------------- |
| GET    | `/api/auth/me` | required | Current user, roles, and tenant memberships |

> Login, logout, and token refresh are handled by Supabase Auth on the client. Pass the `access_token` from Supabase as a Bearer token.

### Tenants — platform admins only

| Method | Path                                    | Description                                           |
| ------ | --------------------------------------- | ----------------------------------------------------- |
| GET    | `/api/tenants`                          | List all tenants                                      |
| POST   | `/api/tenants`                          | Create a tenant                                       |
| PATCH  | `/api/tenants/:tenantId`                | Update tenant name / slug                             |
| DELETE | `/api/tenants/:tenantId`                | Delete a tenant                                       |
| POST   | `/api/tenants/:tenantId/admins`         | Assign tenant admin (creates Supabase user if needed) |
| DELETE | `/api/tenants/:tenantId/admins/:userId` | Remove tenant admin                                   |

### Tenant Users — platform admin or tenant admin

| Method | Path                                   | Description                                  |
| ------ | -------------------------------------- | -------------------------------------------- |
| GET    | `/api/tenants/:tenantId/users`         | List users in tenant                         |
| POST   | `/api/tenants/:tenantId/users`         | Add member (tutor / student / finance_admin) |
| PATCH  | `/api/tenants/:tenantId/users/:userId` | Update user flags (e.g. `banned`)            |
| DELETE | `/api/tenants/:tenantId/users/:userId` | Remove user from tenant                      |

## Error Format

All errors follow a consistent envelope:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Tenant not found"
  }
}
```

Validation errors include a `details` array:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "details": [
      "email must be an email",
      "password must be longer than or equal to 8 characters"
    ]
  }
}
```

| HTTP Status | Code                    |
| ----------- | ----------------------- |
| 400         | `BAD_REQUEST`           |
| 401         | `UNAUTHORIZED`          |
| 403         | `FORBIDDEN`             |
| 404         | `NOT_FOUND`             |
| 409         | `CONFLICT`              |
| 422         | `UNPROCESSABLE_ENTITY`  |
| 429         | `TOO_MANY_REQUESTS`     |
| 500         | `INTERNAL_SERVER_ERROR` |

## Database Schema

Migrations live in `drizzle/`. Run with `pnpm exec drizzle-kit migrate`.

| Table                | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `users`              | Shadow table for Supabase Auth users. `id` = Supabase UUID. |
| `profiles`           | Optional profile fields (name, locale, timezone, avatar).   |
| `tenants`            | Tenant organisations (schools).                             |
| `platform_admins`    | Users with platform-wide admin access.                      |
| `tenant_memberships` | User ↔ tenant assignments with role.                        |
| `audit_logs`         | Immutable audit trail (fire-and-forget, never throws).      |

**Roles** (`tenant_role` enum): `tenant_admin` · `tutor` · `student` · `finance_admin`

**User status** (`user_status` enum): `active` · `disabled`

## Auth Flow

```
Client                    NestJS                        Supabase
  │                          │                              │
  │── POST /auth/v1/token ──────────────────────────────► │
  │◄── { access_token } ───────────────────────────────── │
  │                          │                              │
  │── GET /api/auth/me ──►  │                              │
  │      Bearer <token>      │── jwtVerify (JWKS cache) ──►│
  │                          │◄── { sub, email, ... } ─── │
  │                          │                              │
  │                          │── SELECT users + memberships │
  │                          │   (lazy upsert on first call)│
  │◄── { user, memberships } │                              │
```

- JWKS keys are fetched from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` on first request and cached in memory.
- No network call to Supabase per request after the initial key fetch.
- Key rotation is handled automatically via the `kid` header in the JWT.

## Rate Limiting

- **Global**: 100 requests / 60 s per IP
- **Tenant write endpoints** (POST, PATCH, DELETE): 20 requests / 60 s per IP
