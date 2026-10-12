# Cloudflare API

The Worker runs the fishing API and issues the site session used by fishing.
Minecraft continues to generate the same 32-character, 5-minute one-time
login token. The updated Paper plugin registers that token at the Worker,
where it is consumed exactly once from D1. No Google service-account key is
needed, and the existing Firebase database token path is no longer used for
new login links.

The Worker stores profiles, shared weather, and one-time login tokens in D1.
It signs short-lived site sessions with a Cloudflare Worker secret. The
plugin-to-Worker credential is a separate secret that must be kept only in the
Minecraft server's environment/configuration and the Worker's secret store.

## Deployment status

- D1 `mvdef-fishing` has been created in the Cloudflare account's Eastern
  Europe region.
- Migration `0001_fishing.sql` (player profiles and shared weather) has been
  applied remotely.
- Migration `0002_login_tokens.sql` (one-time Minecraft login tokens) has been
  applied remotely.
- Account subdomain `mvdef-mc.workers.dev` is registered.
- Worker `mvdef-fishing-api` is deployed at
  `https://mvdef-fishing-api.mvdef-mc.workers.dev`.

## Deploy the Worker

From this directory:

```powershell
npm ci
npm test
npm exec -- wrangler deploy --dry-run
npm exec -- wrangler deploy
```

`worker/.dev.vars` is a local-only secrets file ignored by Git. It must contain
two randomly generated secrets before deployment:

```dotenv
SESSION_SECRET="at-least-32-random-characters"
LOGIN_ISSUER_SECRET="a-different-at-least-32-random-characters"
```

The Worker secrets have already been uploaded using Wrangler's protected
`--secrets-file` option. To rotate them later, update `.dev.vars` and deploy
again. Never commit `.dev.vars` or place either value in website JavaScript.
Keep the separate private file `plugin-login-secret.local` to configure the
Minecraft server's `MVDEF_LOGIN_API_SECRET` environment variable.

The Worker URL is already configured in `js/cloudflare-config.js`. Publish the
updated website files to GitHub Pages so the new login and fishing code goes
live.

## Update the Minecraft plugin

The plugin's default API URL is already set to the deployed Worker. Rebuild
the Paper plugin:

```powershell
cd ..\plugin
.\gradlew.bat shadowJar
```

Install `plugin/build/libs/MVDeF-Plugin.jar` on the Minecraft server and
restart it. Set the same secret from the local `plugin-login-secret.local`
file as the Minecraft server process's `MVDEF_LOGIN_API_SECRET` environment
variable. Alternatively add it as `login-api-secret` under
`plugins/MVDeF/config.yml`. Do not put the secret in the source repository or
send it in chat. The plugin's default API URL is
`https://mvdef-fishing-api.mvdef-mc.workers.dev`.

The existing Firebase Admin key used by other plugin features remains on the
Minecraft server; it is not copied to Cloudflare. Existing Firebase token
records are not migrated, so create a fresh `//empire` link after installing
the updated plugin.

## Site origin and testing

`ALLOWED_ORIGINS` in `wrangler.toml` includes the current GitHub Pages origin
`https://mivish-mvcor.github.io` and local test servers. Add any custom website
origin there before deploying.

The free Cloudflare plan has daily Worker and D1 usage limits. Requests can
temporarily fail after those limits are reached.
