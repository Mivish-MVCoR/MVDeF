# Legacy Firebase Functions source

The active login exchange and fishing API are being moved to Cloudflare
Workers, so the root Firebase configuration no longer deploys this directory.
See [`../worker/README.md`](../worker/README.md) for the Cloudflare setup and
deployment instructions.

The modules and tests here remain the source of the fishing rules and can
continue to be checked locally:

```powershell
npm test
npm run simulate:xp
```
