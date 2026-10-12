# Firebase Functions

The login exchange runs in `europe-west1`. It atomically claims and removes a
short-lived token created by the Minecraft plugin, then exchanges it for a
Firebase Authentication custom token. The browser receives a Firebase Auth
session; it never reads the one-time token record directly.

## Local checks

From this directory:

```sh
npm install
npm test
npm run simulate:xp
```

The fish catalog, rarity/venue distributions, weather, progression, and
server-authoritative player actions are implemented under `src/fishing/`.
The browser calls `getFishingState` and `fishingAction`; it does not choose
fish, mass, sale prices, or XP rewards. World weather uses shared 15-minute
cycles, and the shared in-game clock currently uses UTC.

## Deployment

Deploy the functions before publishing the updated login and fishing pages:

```sh
firebase deploy --only functions
```

The Firebase project is configured as `mvdef-856` in the root `.firebaserc`.
Cloud Functions deployment requires a Firebase project plan that supports
Functions and a user with deployment permissions. No service-account key or
other deployment secret belongs in this repository.

Deployment has not been performed as part of local development. This
configuration intentionally does not change Realtime Database rules. Review
and deploy database rules separately before public release: the current rules
are unknown, and broad client write access to `mvdef/fishingPlayers` would let
users bypass the authoritative functions. Preserve existing site and plugin
access while restricting client writes to fishing state.
