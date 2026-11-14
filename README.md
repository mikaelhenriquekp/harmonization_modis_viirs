# Paparajote Lunar

React + Vite frontend, Go (chi) backend, PostgreSQL. It deploys to https://paparajotelunar.com through GitHub Actions on a self-hosted runner.

See [CLAUDE.md](CLAUDE.md) for the architecture, conventions and git workflow.

## Development

Requirements: Docker, Node 24+, and Go 1.26+ (Go is only needed for running tests or lint outside Docker).

```bash
# Terminal 1: Postgres + API with hot reload (http://localhost:8080/api/health)
cd backend
docker compose up

# Terminal 2: frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Migrations in `backend/migrations` are applied automatically whenever the API starts.

## Production

```
Internet ──► Caddy :80/:443 (auto HTTPS) ──┬─ /api/* ──► api (Go) ──► db (Postgres)
                                           └─ /*     ──► web (nginx serving the SPA)
```

Every push to `main` runs CI and then deploys on the VPS (`deploy.yml`).

### One-time server setup (VPS 195.35.0.203, Ubuntu)

1. **DNS** (Nominalia): set the `paparajotelunar.com` **A** record to `195.35.0.203`. Keep the `www` CNAME pointing to `paparajotelunar.com.` and remove any AAAA records. Check with `dig +short paparajotelunar.com`.

2. **Firewall:** allow SSH, HTTP and HTTPS:
   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
   ```
   Also open 80 and 443 in the VPS provider's firewall panel, if it has one. Nothing else may be listening on 80 or 443 (e.g. a system nginx or apache).

3. **Docker:**
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   ```

4. **Runner user + GitHub self-hosted runner:**
   ```bash
   sudo adduser --disabled-password --gecos "" github-runner
   sudo usermod -aG docker github-runner
   sudo su - github-runner
   ```
   On GitHub, go to **Settings → Actions → Runners → New self-hosted runner → Linux** and run the download and `./config.sh` commands it shows (as `github-runner`). Keep the default labels (`self-hosted`, `Linux`, `X64`). Then install the runner as a service so it survives reboots:
   ```bash
   exit   # back to your sudo user
   cd /home/github-runner/actions-runner
   sudo ./svc.sh install github-runner && sudo ./svc.sh start
   ```

5. **GitHub settings:** under **Settings → Secrets and variables → Actions**, add:

   | Kind     | Name                | Value                                 |
   | -------- | ------------------- | ------------------------------------- |
   | Variable | `DOMAIN`            | `paparajotelunar.com`                 |
   | Variable | `ACME_EMAIL`        | email for Let's Encrypt expiry notices |
   | Secret   | `POSTGRES_PASSWORD` | output of `openssl rand -hex 24`      |

   `POSTGRES_USER` and `POSTGRES_DB` variables are optional and default to `app`. Don't change the password after the first deploy: Postgres only reads it when it initializes the data volume.

6. Push to `main`, or run the **Deploy** workflow manually. Caddy gets the TLS certificates on first start, which needs DNS to already point at the VPS.

### Useful commands on the server

```bash
cd ~/actions-runner/_work/<repo>/<repo>
docker compose -p app -f deploy/docker-compose.prod.yml ps
docker compose -p app -f deploy/docker-compose.prod.yml logs -f api caddy
docker compose -p app -f deploy/docker-compose.prod.yml exec db psql -U app app
```
