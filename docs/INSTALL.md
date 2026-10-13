# Installing Water Tenure Storymap on a server

This guide takes a fresh Ubuntu 24.04 server to a public site with TLS, running the synthetic sample. Replacing the sample with your own content is covered in [CONTENT.md](CONTENT.md).

You need:

- a server (virtual machine) with Ubuntu 24.04, 2 GB RAM or more (building the web image is the heaviest step) and 10 GB of free disk;
- a domain name you control, for example `tenure.example.org`;
- SSH access with `sudo`.

Commands are run as a normal user with `sudo` rights.

## 1. Point the domain at the server

At your DNS provider, create an `A` record (and an `AAAA` record if the server has IPv6) for `tenure.example.org` with the server's public IP address. DNS changes can take minutes to hours to propagate; check with `dig +short tenure.example.org`.

## 2. Install Docker Engine and the Compose plugin

Follow Docker's official instructions for Ubuntu (https://docs.docker.com/engine/install/ubuntu/). In short:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"    # log out and back in for this to take effect
docker compose version
```

## 3. Get the code and configure it

```bash
git clone https://github.com/movanet/water-tenure-storymap.git
cd water-tenure-storymap
cp .env.example .env
chmod 600 .env
```

Edit `.env`:

- `TENURE_API_TOKEN`: a long random string, for example the output of `openssl rand -hex 32`. Anyone with this token can create, change and delete records and photos. Keep it out of version control and chat messages.
- `SEED_SAMPLE=true` loads the synthetic sample into the empty database on first start. Set it to `false` before you load your own records (see [CONTENT.md](CONTENT.md#importing-a-catalogue)); seeding only ever happens while the database is empty.
- Leave `BIND_ADDRESS=127.0.0.1`: the containers are then reachable only from the server itself, and the reverse proxy below is the only way in.

Edit the files in `web/content/` now or later (site name, colours, footer, map view, layers, stories). They are built into the web image, so changes need a rebuild (step 4 again).

## 4. Build and start

```bash
docker compose up -d --build
docker compose ps          # both services should become "healthy"
curl -s http://127.0.0.1:8000/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

The first build downloads the base images and the npm and pip packages and takes several minutes. `docker compose logs -f api` and `docker compose logs -f web` show the logs.

## 5. Put a TLS reverse proxy in front

### Option A: Caddy (recommended; automatic certificates)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo sed -i 's/tenure.example.org/YOUR.DOMAIN/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains a certificate from Let's Encrypt on the first request; ports 80 and 443 must be open:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Note that Docker publishes container ports through its own firewall rules, which bypass `ufw`. This is why the compose file binds the ports to `127.0.0.1`; do not change `BIND_ADDRESS` to `0.0.0.0` on a public server.

### Option B: Nginx

Obtain a certificate (for example with `certbot --nginx`) and route `/api/` to the API and everything else to the web app:

```nginx
server {
    listen 443 ssl;
    server_name tenure.example.org;
    # ssl_certificate and ssl_certificate_key lines added by certbot

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Open `https://YOUR.DOMAIN/` and `https://YOUR.DOMAIN/api/health` to check.

## 6. Load your own records

See [CONTENT.md](CONTENT.md#importing-a-catalogue). In short: turn your catalogue into records with `tools/import_catalogue.py`, then either post them with the token (`--post https://YOUR.DOMAIN`) or seed an empty database from a file mounted at `/seed` (see the commented volume in `docker-compose.yml` and `SEED_FILE` in `.env`).

To remove the synthetic sample from a running site, delete its records through the API (their ids start with `sample-`; see [API.md](API.md)) or start over with an empty database (step 8, "Start over").

## 7. Backups

All server-side data lives in the Docker volume `water-tenure-storymap_tenure-data`: the SQLite database `tenure.db`, the photos and the thumbnails. Your content files are in the git checkout (commit them to your own repository).

Back up the volume with a short-lived container. Stopping the API first gives a consistent copy of the database:

```bash
mkdir -p ~/backups
docker compose stop api
docker run --rm -v water-tenure-storymap_tenure-data:/data -v ~/backups:/backup alpine \
  tar czf /backup/tenure-data-$(date +%F).tar.gz -C /data .
docker compose start api
```

Restore into an empty volume:

```bash
docker compose down
docker run --rm -v water-tenure-storymap_tenure-data:/data -v ~/backups:/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/tenure-data-YYYY-MM-DD.tar.gz -C /data"
docker compose up -d
```

Copy the backup files off the server (for example with `rsync` or your provider's object storage), and test a restore from time to time. Photos are personal data when people can be recognized in them; store the backups as carefully as the server.

## 8. Upgrading

```bash
cd water-tenure-storymap
docker compose stop api
# take a backup first (step 7)
git pull
docker compose up -d --build
docker compose ps
```

The API adds missing database columns on start, so existing data carries over. Read the release notes before upgrading across a major version.

Start over (deletes all records and photos):

```bash
docker compose down -v
docker compose up -d --build
```

## Troubleshooting

- `docker compose ps` shows the web service waiting: it starts only after the API reports healthy. Check `docker compose logs api`.
- The map shows no tenure records: open `/api/tenure-records.geojson` in the browser. If it is empty, the database has no records (`SEED_SAMPLE` was `false` on first start, or the records were deleted). If it fails, check that the reverse proxy routes `/api/*` to port 8000.
- Writes fail with HTTP 503: `TENURE_API_TOKEN` is empty in `.env`. Set it and run `docker compose up -d`.
- Photo uploads fail with HTTP 413: raise `MAX_UPLOAD_MB` in `.env` and the proxy's body size limit (`request_body max_size` in Caddy, `client_max_body_size` in Nginx).
- Content changes do not appear: content is built into the web image; run `docker compose up -d --build web`.
