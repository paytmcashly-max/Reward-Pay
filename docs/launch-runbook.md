# Reward Wallet Launch Runbook

## 1. Before going live

- Confirm `render.yaml` services are created and healthy.
- Set live values for:
  - `CASHFREE_CLIENT_ID`
  - `CASHFREE_CLIENT_SECRET`
  - `CASHFREE_WEBHOOK_SECRET`
  - `MSG91_AUTH_KEY`
  - `MSG91_TEMPLATE_ID`
  - `ADMIN_SUPER_PHONE`
  - `ADMIN_SUPER_PASSWORD`
  - `ADMIN_OPERATOR_PHONE`
  - `ADMIN_OPERATOR_PASSWORD`
- Keep `EXPLICIT_MOCK_PAYOUTS=true` until live payout access is verified with Cashfree.
- Run `npm run doctor:api` against the production env locally before deploy.

## 2. Deployment verification

- Open `/health` and confirm `ok: true`.
- Open `/health/providers` and confirm:
  - `storageMode=postgres`
  - `otpMode=redis`
  - `memoryInfrastructure=false`
  - `cashfree.paymentsLive=true`
  - `otpProvider=msg91`
- Verify Postgres migration and seed completed without error.

## 3. Payment verification

- Create one low-value deposit in the release APK.
- Confirm Cashfree checkout opens in app.
- Confirm successful payment sync moves order to `listed`.
- Confirm duplicate sync/webhook does not double-credit the wallet.
- Confirm cancelled payment stays non-credited and can be investigated from admin.

## 4. Withdrawal review

- Create one withdrawal request from a funded test account.
- Confirm request enters `queued_for_review`.
- Open admin console and review the withdrawal row.
- Approve the request only when payout access is live.
- If payouts are still mocked, use the admin queue for process validation only.

## 5. Failure investigation

- Payment issue:
  - inspect admin deposits
  - inspect provider events for the deposit
  - run a sync on the order
  - confirm Cashfree webhook signature is present and valid
- OTP issue:
  - verify MSG91 env values
  - verify Redis connectivity
  - check rate-limit responses
- Withdrawal issue:
  - confirm user has withdrawable balance
  - confirm beneficiary is valid
  - confirm payout adapter mode in `/health/providers`

## 6. Emergency actions

- To stop new payments temporarily:
  - set `EXPLICIT_MOCK_PAYMENTS=true`
  - redeploy
- To stop production boot with unsafe local fallbacks:
  - keep `ALLOW_DEV_HEADERS=false`
  - keep `ALLOW_MEMORY_INFRASTRUCTURE=false`
- To pause sell matching:
  - use admin matching pause control

## 7. Release artifact handling

- Distribute only the signed APK from `builds/`.
- Keep version name and changelog with each release.
- Smoke-test every APK on:
  - emulator
  - one real Android device
