# Reward Wallet Platform

Monorepo scaffold for:

- `apps/api`: Node.js backend for auth, wallet, deposits, rewards, marketplace, withdrawals, referrals, admin
- `apps/mobile`: React Native app (Expo) for Android-first user flows
- `apps/admin`: React admin dashboard
- `packages/shared`: shared domain types and constants

## Quick Start

```bash
npm install
npm run dev:api
npm run dev:mobile
npm run dev:admin
```

### Environment

- API env: copy `apps/api/.env.example` to `.env`
- Mobile env: copy `apps/mobile/.env.example` to `.env`
- Admin env: copy `apps/admin/.env.example` to `.env`
- Production templates are also included:
  - `apps/api/.env.production.example`
  - `apps/mobile/.env.production.example`
  - `apps/admin/.env.production.example`
- Local defaults are already created in:
  - `apps/api/.env`
  - `apps/mobile/.env`
  - `apps/admin/.env`

Default local credentials:

- Admin phone: `9999999999`
- Admin password: `admin1234`
- Operator phone: `8888888888`
- Operator password: `operator1234`

OTP in development:

- Debug OTP is returned by `POST /auth/send-otp`
- Default dev OTP code remains `123456`

## Production Hardening

- Production API is expected to run with:
  - `ALLOW_DEV_HEADERS=false`
  - `ALLOW_MEMORY_INFRASTRUCTURE=false`
  - `EXPLICIT_MOCK_PAYMENTS=false`
- Payouts may stay mocked for phase 1 launch:
  - `EXPLICIT_MOCK_PAYOUTS=true`
- Production OTP is expected to use `MSG91`.
- Admin seeded credentials should never be used in production.
- Render blueprint:
  - [render.yaml](./render.yaml)
- Launch docs:
  - [docs/launch-runbook.md](./docs/launch-runbook.md)
  - [docs/android-release-checklist.md](./docs/android-release-checklist.md)

## Backend Test

```bash
npm run test:api
```

## Database Bootstrap

```bash
npm run db:migrate --workspace @reward-wallet/api
npm run db:seed --workspace @reward-wallet/api
```

If `DATABASE_URL` is present, the API boots with `PostgresStore` automatically and persists runtime state into Postgres. If it is missing but `STATE_FILE_PATH` is present, the API uses a local `FileStore` snapshot. Otherwise it falls back to `InMemoryStore`.

## Live Switch Checklist

1. Set `DATABASE_URL` in `apps/api/.env`
   - Supabase Postgres works directly with the current API runtime
2. Set `REDIS_URL` in `apps/api/.env`
   - Use Render Key Value or another hosted Redis-compatible service
3. For non-admin local development, keep:
   - `STATE_FILE_PATH=./.data/platform-state.json`
   - `OTP_STATE_FILE_PATH=./.data/otp-state.json`
4. Fill:
  - `CASHFREE_CLIENT_ID`
  - `CASHFREE_CLIENT_SECRET`
  - `CASHFREE_PAYMENT_API_VERSION`
  - `CASHFREE_PAYOUT_API_VERSION`
  - optional `CASHFREE_WEBHOOK_SECRET`
  - `MSG91_AUTH_KEY`
  - `MSG91_TEMPLATE_ID`
5. Set `EXPLICIT_MOCK_PAYMENTS=false`
6. Keep `EXPLICIT_MOCK_PAYOUTS=true` until your Cashfree payouts account/API access is enabled, then switch it to `false`
7. Rotate:
   - `JWT_SECRET`
   - `ADMIN_SUPER_PASSWORD`
   - `ADMIN_OPERATOR_PASSWORD`
8. Ensure:
   - `ALLOW_DEV_HEADERS=false`
   - `ALLOW_MEMORY_INFRASTRUCTURE=false`
9. Run:

```bash
npm run doctor:api
npm run db:migrate --workspace @reward-wallet/api
npm run db:seed --workspace @reward-wallet/api
npm run dev:api
```

Use `GET /health/providers` to confirm whether Cashfree, Postgres, and Redis are live.

## Render + Supabase Production Shape

- Host the API on Render using [render.yaml](./render.yaml)
- Use Supabase for `DATABASE_URL`
- Use Render Key Value or another hosted Redis-compatible provider for `REDIS_URL`
- Fill the remaining production secrets in Render before the first deploy

## Production APK Build

For a production API URL build, create `apps/mobile/.env.production` from the example and run:

```bash
npm run build:apk:production --workspace @reward-wallet/mobile
```

## Notes

- Money rails are adapter-based. The current default is mock/sandbox unless Cashfree credentials are configured.
- Matching is handled by an in-process scheduler for local development.
- Mobile now supports OTP login, token persistence, wallet refresh, deposit order creation, withdrawal requests, and game settlement against the API.
- Admin now supports login, live dashboard fetches, deposit review, withdrawal approval/rejection, user blocking, and reward/bucket/demand config updates.
