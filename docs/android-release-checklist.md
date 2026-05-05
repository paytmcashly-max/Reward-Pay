# Android Release Checklist

- Confirm `EXPO_PUBLIC_API_BASE_URL` points to the production API.
- Confirm latest release keystore is present and release signing is active.
- Run:
  - `npm run typecheck --workspace @reward-wallet/mobile`
  - `npm run test --workspace @reward-wallet/api`
  - `npm run build:apk --workspace @reward-wallet/mobile`
- Install the signed APK on a clean emulator.
- Verify:
  - login
  - add money
  - payment success
  - payment cancel
  - receipt open
  - withdraw submit
  - profile and activity open
- Install the same APK on one physical Android device.
- Confirm no debug credentials or localhost URLs appear in the UI.
- Publish only the final signed artifact from `builds/`.
