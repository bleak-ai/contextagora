# Deploying another ContextAgora instance behind the shared Cloudflare tunnel

Internal ops guide. Covers adding a new ContextAgora deploy on the existing VPS, routing it through the **already-running** `cloudflared` container, and optionally gating it behind Cloudflare Zero Trust Access.

## Mental model (read this first)

- **One VPS** runs many ContextAgora instances, each on a different host port (`3333`, `3334`, …).
- **One cloudflared container** (with `network_mode: host`) serves all of them. You do **not** create a new tunnel per deploy — you add a new *Public Hostname* to the existing tunnel.
- **One DNS zone per product domain** (`bleakai.com`, `contextagora.com`, …). Cloudflare creates the CNAME automatically when you add a Public Hostname, as long as the zone is on the same Cloudflare account.

If a hostname "works without a tunnel," it's almost certainly routed via the existing tunnel — check *Zero Trust → Networks → Tunnels → (tunnel) → Public Hostnames*.

## Prerequisites

- The shared `cloudflared` container is already running on the VPS (see existing deploy).
- The target domain's DNS is managed by the same Cloudflare account.
- A fresh `.env` file with the credentials for this new instance.

## 1. Deploy the new container (Coolify)

Create a new Coolify service with its own `docker-compose.yml`. Pick a host port that nothing else on the VPS is using.

```yaml
services:
  contextagora-<name>:
    image: 'ghcr.io/bleak-ai/contextagora:latest'
    ports:
      - '<HOST_PORT>:9090'   # e.g. 3334, 3335, …
    env_file:
      - .env                 # unique env for this instance
    restart: unless-stopped
```

Deploy, then verify from the VPS shell:

```bash
docker ps | grep contextagora-<name>
curl -I http://localhost:<HOST_PORT>   # expect a response from uvicorn
```

If `curl` fails, nothing in Cloudflare will make it work — fix the container first.

## 2. Add a Public Hostname to the existing tunnel

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels**.
2. Open the existing tunnel (the one `cloudflared` on the VPS is authenticated against).
3. **Public Hostnames** tab → **Add a public hostname**:
   - **Subdomain**: e.g. `demo`, `app`, `staging`
   - **Domain**: pick the target zone from the dropdown
   - **Path**: leave empty
   - **Service Type**: `HTTP`
   - **URL**: `localhost:<HOST_PORT>` (must match step 1)
4. Save.

Cloudflare automatically creates a proxied CNAME (`<sub>.<domain>` → `<tunnel-id>.cfargotunnel.com`) in the zone's DNS. Within ~30s the hostname is live.

Quick check from your laptop:

```bash
curl -sSI https://<sub>.<domain> | head -20
```

Expect a `200` (or whatever the app returns) and `server: cloudflare`.

## 3. (Optional) Protect with Zero Trust Access

Only if this instance must require login.

1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Configure:
   - **Name**: descriptive
   - **Session duration**: e.g. `24h`
   - **Application domain**: exactly the hostname from step 2
3. **Add a policy**:
   - **Action**: `Allow`
   - **Rule**: e.g. `Emails ending in` → `@bleakai.com`, or specific email list
4. **Identity providers**: One-Time PIN works out of the box (email code). Google/GitHub etc. need to be enabled under *Settings → Authentication* first.
5. Save.

Next request to the hostname redirects to a Cloudflare login page; only matching identities reach the container.

## Decommissioning (removing an instance cleanly)

**All three layers must be removed** — otherwise the hostname keeps resolving and looks "half alive":

1. **Cloudflare tunnel Public Hostname**: *Zero Trust → Networks → Tunnels → (tunnel) → Public Hostnames* → delete the row for the hostname.
2. **Cloudflare DNS record**: dashboard → (zone) → **DNS** → delete the CNAME for the subdomain. *(Cloudflare usually cleans this up when you delete the Public Hostname, but double-check.)*
3. **Coolify service / container**: stop and remove the Coolify app, or `docker rm -f <container>` on the VPS.
4. **Zero Trust Access application** (if step 3 was done): *Zero Trust → Access → Applications* → delete the app for that hostname.

Verify nothing orphan remains:

```bash
dig +short <old-hostname>          # should return NXDOMAIN / nothing useful
docker ps -a | grep <service>      # should be empty
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `no available server` from Cloudflare | Tunnel reached, but no matching Public Hostname, or backend port wrong |
| Hostname still serving old content after migration | Old Public Hostname + DNS CNAME still present (see *Decommissioning*) |
| Container healthy, hostname `502`/timeout | Public Hostname URL points to wrong port, or scheme is `HTTPS` instead of `HTTP` |
| `curl localhost:<port>` on VPS fails | App isn't really listening — check `docker logs <container>`; port collision binds silently in some setups |
| Login loop on Zero Trust app | Application domain in the Access app doesn't match the Public Hostname exactly (including subdomain) |
