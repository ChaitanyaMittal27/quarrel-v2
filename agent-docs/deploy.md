# Stage 11B: one-box production deployment

Quarrel was deployed once on AWS for practice; the server has since been discontinued
and is not maintained. This runbook is retained for reuse; see the
[deployment notes](../deploy/README.md). No load-test or production-hardening results are recorded.
Target: one Ubuntu 24.04 LTS EC2 t3.small (2 GB RAM), Docker Compose and Caddy on a free
DuckDNS hostname. nginx still serves the UI and routes REST/Socket.IO to the API.

## 1. Console steps (guided in chat)

- Console steps: launch the instance, configure access, allocate/associate its Elastic IP.
- Console steps: instance stop/start and storage lifecycle choices are guided in chat.
- Point your DuckDNS hostname at the Elastic IP **before** starting Caddy. Public DNS must
  resolve correctly and inbound TCP80/443 must reach the instance for automatic certificates;
  UDP443 enables HTTP/3. No wildcard certificate or DuckDNS API token is needed by Caddy.

## 2. SSH and update Ubuntu

On your computer, replace the key path and Elastic IP:

```bash
ssh -i /path/to/key.pem ubuntu@ELASTIC_IP
```

On the instance:

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git openssl
```

If `/var/run/reboot-required` exists, run `sudo reboot`, then reconnect before continuing.

## 3. Add 2 GB swap

For a fresh Ubuntu host; the guards avoid formatting an existing swapfile on a repeat run:

```bash
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
fi
if ! sudo swapon --show=NAME --noheadings | grep -Fxq /swapfile; then
  sudo swapon /swapfile
fi
grep -Fqx '/swapfile none swap sw 0 0' /etc/fstab || printf '%s\n' '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
free -h
swapon --show
```

Swap helps with build peaks; it is slower than RAM and is not a capacity guarantee.

## 4. Install Docker from its official apt repository

These commands follow [Docker's Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/)
for a fresh host (no distro docker.io/legacy docker-compose installation):

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
exit
```

SSH back in so the group change takes effect. Docker-group membership grants root-level
host access. Verify:

```bash
docker version
docker compose version
```

Require Compose **v2.24+ or v5+**; update docker-compose-plugin from the official apt repo
if older. Its current plugin supports the [!reset merge tag](https://docs.docker.com/reference/compose-file/merge/).
Do not substitute legacy `docker-compose` or remove the port resets to bypass a version error.

## 5. Clone and configure privately

```bash
git clone https://github.com/ChaitanyaMittal27/quarrel-v2.git
cd quarrel-v2
umask 077
cp deploy/env.production.example .env.local
chmod 600 .env.local
nano .env.local
```

Replace every `REPLACE_WITH_...` value and `YOUR_APP.duckdns.org`. Generate **different**
session/database secrets privately with `openssl rand -hex 32`; do not paste them into chat
or commit them. DATABASE_URL references `${POSTGRES_PASSWORD}`: Compose expands it from the
selected env file. Hex passwords need no URI escaping. Changing POSTGRES_PASSWORD later does
not change an already-initialized database password; coordinate SQL password rotation and
DATABASE_URL before restarting. Keep user/database `quarrel` and host `postgres:5432`.

`JUDGE_AI_MODE=auto` means real AI when keys are set; `real` is not an accepted config value.
For a no-provider first smoke test, privately choose demo, then change to auto only when ready.
Use a separate TTS key, or leave GEMINI_TTS_API_KEY empty for browser fallback. Verify model
access/free quotas in your own Google project. Keep COOKIE_SECURE/TRUST_PROXY true; production
enforces them. API stays on4000 internally. Never use e2e/compose.yml in production.

Do not run `cat .env.local`, a full resolved `docker compose config`, or environment dumps
with real values. Use quiet validation. Do not source the env file in your shell. Production
resets the base service env_file and explicitly maps settings from `--env-file`; when adding
server config later, update docker-compose.prod.yml's app-environment mapping as appropriate.

## 6. First launch

From the repo root, with the hostname already pointing at the Elastic IP:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.local config --quiet
export COMPOSE_PARALLEL_LIMIT=1
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.local up -d --build
```

The parallel limit reduces Compose build/pull concurrency on the small host; swap still
matters. Dockerfiles are unchanged. Redis has maxmemory128mb/noeviction: queues/live state
must not be silently evicted. Hitting the cap rejects writes; monitor logs/memory rather
than enabling eviction. Node API/worker V8 heaps are capped at256MB each; native buffers and
total RSS are additional. Actual2GB performance must be measured on the instance.

Define this helper in each new SSH session after `cd ~/quarrel-v2`:

```bash
prod() { docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.local "$@"; }
prod ps
prod logs --tail=100 caddy web api worker postgres redis
```

API runs migrations before healthy; worker waits for it. Caddy starts after web. It obtains
and renews the hostname certificate automatically, redirects HTTP to HTTPS, compresses
responses and proxies **everything** to web:80. nginx owns /api and /socket.io; Caddy's proxy
supports WebSocket upgrades without duplicate routes. Keep API/worker/Redis/Postgres/web
unpublished. Only Caddy publishes80/tcp,443/tcp,443/udp. Certificates persist in caddy_data;
caddy_config and pgdata are named volumes too. All services restart unless explicitly stopped
and rotate json-file logs at10MB x3 files each.

## 7. Post-launch checks (owner)

- Open `https://YOUR_APP.duckdns.org`: correct hostname, padlock, no certificate warning;
  HTTP redirects to HTTPS. Caddy logs should show successful certificate management.
- `curl -fsS https://YOUR_APP.duckdns.org/api/health` must report API/Redis/Postgres healthy.
- Play from two devices, including a phone on **mobile data**, through Ready/Start/debate;
  check live pushes/reconnects and voice when deliberately enabled. This verifies both proxy
  hops and real network conditions, not just a static page.
- Browser devtools: the session cookies have Secure, HttpOnly and expected paths. Confirm
  HSTS, X-Content-Type-Options:nosniff and Referrer-Policy response headers.
- From outside the instance, use an online port check for5432/6379 (also dev5433/6380,
  API4000 and web3000): all must be unreachable. Check `prod ps` for only Caddy's public ports.
- Check `free -h`, `docker stats --no-stream` and logs during play; inspect free disk space
  with `df -h`. Actual model quotas/audio quality and t3.small build/runtime capacity are human checks.

## 8. Updates and logs

After the owner commits/pushes and CI passes, SSH in and define `prod` as above:

```bash
git pull --ff-only
prod pull caddy postgres redis
export COMPOSE_PARALLEL_LIMIT=1
prod up -d --build
prod restart web
prod ps
prod logs --tail=100 api worker caddy
```

Restart web after an API recreation: nginx resolves its static `api` upstream at startup,
and a replacement API container may have a new address. Existing sockets reconnect; this
one-box deployment has update downtime. Repeat health/two-device checks after changes.
For live diagnostics use `prod logs -f --tail=100 api worker caddy`; Ctrl-C stops following
logs, not services. Logs can contain user content in future code: do not share unreviewed logs.

## 9. Stop/start safely; storage decision

```bash
prod stop --timeout 30
```

Then **console steps**: stop the EC2 instance (guided in chat). To resume: **console steps**
start it, SSH in, `cd ~/quarrel-v2`, define `prod`, then:

```bash
prod up -d
prod ps
```

Explicitly stopped containers stay stopped despite unless-stopped, so run up after resume.
Keep the Elastic IP association/DuckDNS record. Do not use `down -v`, volume pruning, or
instance termination as a stop/restart routine.

**NO backup, by decision.** Postgres archives live only in the named pgdata volume on this
server's disk; no backup/snapshot/export process is configured. Disk loss or deleting its
volume/instance storage loses the archive and may lose Caddy certificates. Redis holds live
game state/queues/TTLs only; no additional persistence beyond the existing image defaults
is introduced. A Redis/host failure may lose active games. Container restarts are not backups.
