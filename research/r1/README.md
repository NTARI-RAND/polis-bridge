<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# R1 spike: Pol.is legacy embed + xid, in three browser engines

Research code for PLAN.md spike R1. Not production code. Findings are in
`docs/research/R1-polis-baseline-handson.md`.

It runs nine checks (C1–C9, plus C5b) against a local, self-hosted Pol.is:
a host page embeds a conversation with the legacy `embed.js` and a `data-xid`,
Playwright votes in Chromium, Firefox and WebKit, and the test reads the
Pol.is database to see whose participant each vote landed under.

## What you need

- Docker with Compose v2+ (tested: Docker 29.6.2, Compose 5.3.1), about 4 GB free inside Docker
- Node 24 and npm 11 on the host
- Free host ports 8180, 8543 (Pol.is), 8190 (host page), 3000 (only for Firefox-in-Docker)

## 1. Run Pol.is (pinned)

```sh
git clone https://github.com/compdemocracy/polis.git
cd polis
git -c core.autocrlf=false checkout d3d38cec8bf81ec2c67fc870ed2abacc59ad0ff2   # branch `stable`, 2026-10-13 (was 30367002 until the 2026-10-13 retest)
```

On Windows, check out with LF line endings (`git config core.autocrlf false`
before checkout). With CRLF the Postgres init script and the nginx entrypoint
fail, and the server refuses to start ("Migration history mismatch").

Make `.env` from upstream's `example.env` and change these lines:

```
HTTP_PORT=8180
HTTPS_PORT=8543
EMBED_SERVICE_HOSTNAME=localhost:8180
API_DEV_HOSTNAME=localhost:8180
PUBLIC_SERVICE_URL=http://localhost:8180/api/v3
TAG=r1
GIT_HASH=d3d38cec8bf81ec2c67fc870ed2abacc59ad0ff2
# admin login: this spike's throwaway issuer (served by host/server.mjs)
AUTH_ISSUER=https://r1-local-issuer.test/
JWKS_URI=http://host.docker.internal:8190/.well-known/jwks.json
# participant tokens: without these Pol.is silently issues none (see the findings)
JWT_PRIVATE_KEY=<base64 of a PKCS#8 RSA private key PEM>
JWT_PUBLIC_KEY=<base64 of the matching SPKI public key PEM>
```

Generate a throwaway JWT pair with:

```sh
node -e 'const{generateKeyPairSync:g}=require("crypto");const{privateKey:k,publicKey:p}=g("rsa",{modulusLength:2048});const b=s=>Buffer.from(s).toString("base64");console.log("JWT_PRIVATE_KEY="+b(k.export({type:"pkcs8",format:"pem"}))+"\nJWT_PUBLIC_KEY="+b(p.export({type:"spki",format:"pem"})))'
```

Add `docker-compose.r1.yml` next to `docker-compose.yml` (nginx-proxy
hard-codes a route to the new "alpha" client; this alias lets it start
without building that client):

```yaml
services:
  file-server:
    networks:
      polis-net:
        aliases: [client-participation-alpha]
```

Build and start only these four services:

```sh
F="-f docker-compose.yml -f docker-compose.r1.yml --profile postgres"
docker compose $F build postgres server file-server nginx-proxy
docker compose $F up -d --no-deps postgres server file-server nginx-proxy
# if the server container was recreated after nginx started, restart nginx:
docker restart polis-r1-nginx-proxy-1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8180/embed.js   # expect 200
```

**Upgrading an existing stack to a newer SHA** (how the 2026-10-13 retest was
done, without recompiling the Rust migration tool): rebuild `server`,
`file-server` and `nginx-proxy`, keep the running postgres image, copy the new
migration files into it, then apply them with the same runner the image uses on
first start:

```sh
docker compose -p polis-r1 $F build server file-server nginx-proxy
MSYS_NO_PATHCONV=1 docker cp server/postgres/migrations/. polis-r1-postgres-1:/migrations/
MSYS_NO_PATHCONV=1 docker exec polis-r1-postgres-1 sh -c 'DATABASE_URL="host=/var/run/postgresql user=$POSTGRES_USER dbname=$POSTGRES_DB sslmode=disable" POLIS_MIGRATIONS_DIR=/migrations polis-migrate apply'
```

This works only while `queue-rs/polis-migrate` itself is unchanged between the
two SHAs (true for 30367002 → d3d38cec). Otherwise rebuild `postgres` too.

Not started: `math-python`/`delphi` (the classic Clojure `math` service no
longer exists at this SHA), `client-participation-alpha`, `dynamodb`,
`ses-local`, `ollama`, `import-worker`, `minio`, `localstack`, coordinator.
Voting, the xid allow-list and the report CSV exports work without them.

## 2. Run the tests

```sh
cd research/r1
npm ci
npx playwright install chromium firefox webkit
npx playwright test --project=chromium --project=firefox --project=webkit
```

The run starts `host/server.mjs` itself, creates two fresh conversations
through the admin API (`tools/setup-conversations.mjs`), then runs the checks.
Results: terminal list plus `test-results/results.json` (each test's
observations are attached as annotations).

Environment knobs: `POLIS_URL` (default `http://localhost:8180`),
`POLIS_PG_CONTAINER` (default `polis-r1-postgres-1`), `R1_REUSE_STATE=1`
(reuse the last run's conversations).

### Firefox on a machine where it will not start

On the R1 machine Windows Smart App Control blocks Playwright's Firefox build
(`spawn UNKNOWN`). Run Firefox in Playwright's own container instead; the
browser's `localhost` traffic is tunnelled back to this machine:

```sh
docker run -d --name r1-pw-server --rm --init -p 127.0.0.1:3000:3000 --workdir /home/pwuser --user pwuser \
  mcr.microsoft.com/playwright:v1.61.0-noble /bin/sh -c "npx -y playwright@1.61.0 run-server --port 3000 --host 0.0.0.0"
PW_REMOTE_WS=ws://127.0.0.1:3000/ npx playwright test --project=chromium --project=webkit --project=firefox-docker
docker stop r1-pw-server
```

## Files

- `host/` the stand-in embed page (`embed.html`, `r1-embed.js`) and its server, which also serves the throwaway issuer's JWKS
- `lib/polis.mjs` admin-token minting, API client, psql helper
- `tools/setup-conversations.mjs` creates the test conversations and seed statements
- `tests/xid-embed.spec.ts` the checks
- `.local/` (gitignored) the throwaway signing key and run state

## Expected result at this SHA

C5, C5b fail in every engine and C8 fails in WebKit. Those failures are the
findings, not test bugs. See the research note. Same result at 30367002 and
at d3d38cec (retest 2026-10-13, Chromium and WebKit).
