<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# R6: Hosting

Research spike R6 (PLAN.md §5, Phase 1). Written 2026-10-12. Feeds the "host" and "domain names" items of Gate 1.

## Question

Where should the polis-bridge MVP run? It has three parts that PLAN.md §3 puts on one host: self-hosted Pol.is (Node API server, Postgres database, math worker, participation client), the bridge (Node and SQLite) and a TLS reverse proxy.

- **Option (a): NTARIHQ behind an outbound-only tunnel.** NTARIHQ is NTARI's own server at home. It opens a connection *out* to a small rented public server (the "relay"), and visitors reach it through that connection. Nothing at home accepts connections from the internet. This matches the JFA substrate's no-inbound-ports design.
- **Option (b): one small rented server (a "VPS") running everything.**

The comparison weighs eight things:

- uptime during week-long voting windows;
- power and internet-provider risk;
- backup and restore;
- data custody (who could read votes or round keys), including the rule that round keys never enter backups;
- cost;
- operating burden for volunteers;
- the same-site domain layout (`polis.ntari.org` and `vote.ntari.org`);
- how DNS works while ntari.org's website is on Wix.

Terms used below:

- **VPS** (virtual private server): a rented slice of a computer in a provider's data center.
- **TLS**: the encryption behind `https://`. **TLS termination** is the point where it's decrypted. Whoever runs that point can read the traffic in plain text.
- **Reverse proxy**: the program that receives web traffic, handles TLS and passes requests to the right app.
- **DNS record**: an entry that tells browsers which server a name like `vote.ntari.org` points to. An **A record** points to an IP address. A **CNAME** points to another name. **Nameservers** are the servers that hold a domain's DNS records.
- **WireGuard**: a simple, widely used encrypted tunnel.
- **Cloudflare Tunnel**: Cloudflare's hosted version of the same idea. A program on your server (`cloudflared`) connects out to Cloudflare.

## Method

1. Read PLAN.md (§1–§3 and the R6 spike), the repo's `CLAUDE.md` and `docs/decisions/000-repo-and-stack.md`.
2. Read five internal notes about NTARIHQ and NTARI's existing infrastructure, read-only. They are NTARI's operations memory, kept by earlier working sessions, and are cited below as "internal notes" with their file names. **No server was logged into or probed.** The only network checks were public DNS lookups of the nameservers for `ntari.org` and `soholink.org` (`nslookup -type=NS`, via 1.1.1.1).
3. Read upstream Pol.is (`compdemocracy/polis`): the default branch `edge` at commit `978fa11244532eb4efd44cbe27578e7ee2889f99`, plus `README.md`, `docker-compose.yml`, `example.env`, `docs/scaling.md` and `docs/ssl.md` at that commit. The `stable` branch is at `30367002aa26c8796fd58aa8acf4203735e943bd`. Both SHAs came from `git ls-remote` on 2026-10-12.
4. Checked small-VPS prices on provider pages, or on third-party pages where the provider's page didn't render prices. Also checked nonprofit-credit programs, Wix DNS help pages, and Cloudflare Tunnel and DNS documentation.
5. Marked each finding **Verified** (with its source) or **Inferred** (my reasoning, not directly confirmed).

## Findings

### F1. What NTARIHQ actually is

- **Verified (internal notes, conflicts with PLAN.md): NTARIHQ looks like a Windows 11 machine, not Ubuntu Server.** PLAN.md calls NTARIHQ "NTARI's Ubuntu Server homelab." The internal notes describe a Windows host instead:
  - Windows scheduled tasks and `pktmon`, Windows' built-in packet capture tool (`netmon-monitoring.md`);
  - the account `ntarihq\jodson graves` (`netmon-monitoring.md`);
  - Docker Desktop and WSL2, the Linux layer inside Windows (`soholink-operator-readiness.md`, `stack-status-2026-07-13.md`, `topology-ntari-os-interface.md`);
  - Windows Smart App Control / WDAC, a program-blocking security feature (`topology-ntari-os-interface.md`);
  - install paths such as `C:\Stalwart` (`stalwart-smtp-wiring.md`).
- **Inferred:** NetMon (the network monitor) watches the same machine. Its notes name the account `ntarihq\...`, and the LAN address `192.168.0.50` appears both as Stalwart's host and as "self" in NetMon. This should be confirmed by whoever runs the box. It's possible there are two machines, or that the Ubuntu description is outdated.
- **Verified (internal notes): the disk is nearly full.**
  - The weekly review for 2026-10-04..10-10 reports C: at 4.2 GB free. It fell from 23.4 to 14.4 to 4.2 GB over three weeks (about 10 GB per week), the cause wasn't identified, and the note estimates about 3 days to full (`netmon-monitoring.md`).
  - The Topology feasibility study had already called NTARIHQ "the last stack the box takes." It noted a WSL2 host with 0.9 GB free and a USB D: drive unsafe for databases (`topology-ntari-os-interface.md`).
- **Verified (internal notes): NTARIHQ already holds critical assets.**
  - It runs the SoHoLINK coordinator (signing key and member database), an Agrinet stack, a Google Ads service and the Stalwart mail server (`stalwart-smtp-wiring.md`).
  - On 2026-07-14 the maintainer declined to expose the mail server publicly. The reason given: no internet-facing service should sit "next to the crown jewels" (`stalwart-smtp-wiring.md`).
- **Verified (internal notes): existing inbound exposure.**
  - SSH is reachable from the internet through a router forward (WAN 52200 → 22), with key-only login (`netmon-monitoring.md`).
  - Windows Firewall allows 25, 443, 465 and 993 (Stalwart) from any address (`netmon-monitoring.md`, 2026-09-11).
  - **Uncertain:** whether the router actually forwards those mail ports. The 2026-07-14 scope decision says no port forward for 25/465/993 (`stalwart-smtp-wiring.md`). The firewall rules alone don't prove the ports are reachable from outside.
  - **Port 443 is already taken by Stalwart** on the host (`stalwart-smtp-wiring.md`). A reverse proxy for Pol.is would need another port or a container network.
- **Verified (internal notes): there's already an outbound tunnel.** SoHoLINK's public site (`soholink.org`, `api.soholink.org`) is served through `cloudflared`, Cloudflare Tunnel (`soholink-operator-readiness.md`). The pattern works on this box today.
- **Verified (internal notes): things don't come back up reliably after restarts.**
  - The SoHoLINK governance console stayed down twice after sleep, wake or Docker restarts. It only restarts at user logon (`soholink-operator-readiness.md`).
  - Docker Desktop restarts have needed manual repair, such as expired SPIRE identity tokens and broken container mounts (`stack-status-2026-07-13.md`).
  - NetMon reviews had gaps on days when the session that runs them was not active (`netmon-monitoring.md`). Docker containers set to `restart: unless-stopped` did self-heal (`soholink-operator-readiness.md`).
- **Verified (internal notes): backups are on the same machine and untested.** SoHoLINK backups are database dumps to the D: drive on the same host. Restore is untested, and there is no off-site copy (`soholink-operator-readiness.md`, item 8).
- **Verified (internal notes): it's on a home internet connection.** The connection is a residential Spectrum/Charter line, and outbound mail from that IP is listed on Spamhaus PBL, a blocklist of home IP ranges (`stalwart-smtp-wiring.md`). The notes don't mention a UPS (battery backup) or backup internet.

### F2. What self-hosted Pol.is needs

- **Verified (upstream `docker-compose.yml` @ `978fa11`):** the compose file defines 15 services. For the MVP the relevant ones are:
  - `server` (the API);
  - `postgres`;
  - `math-python` (the math engine that builds the opinion map);
  - `file-server` and `nginx-proxy` (the web front end);
  - `client-participation-alpha` (the new participation client).

  Several services are for development or AWS emulation: DynamoDB-local, MinIO, localstack, ses-local, and `ollama` for local AI models. `delphi` is an AI and reporting pipeline. R1 must decide which of these a production MVP can leave out.
- **Verified (same file):** `delphi` and `math-python` both default to a 16 GB memory limit (`DELPHI_CONTAINER_MEMORY`, `DELPHI_POLLER_CONTAINER_MEMORY`). The README says these can be lowered in `.env`. A limit is a cap, not a requirement.
- **Verified (upstream `docs/scaling.md`):**
  - "For very small engagements of a few hundred participants, this may be sufficient," referring to one server instance.
  - Math-worker memory grows with participants × comments. Tens of thousands of participants are what call for "dozens of GB."
  - Upstream's own cloud setup uses AWS `t3.medium` (2 vCPU, 4 GB) web instances. Its AI tier is much larger.
- **Verified (upstream `docs/ssl.md`):** the bundled HTTPS uses a public test certificate and is "ONLY suitable for testing." Upstream suggests handling TLS at the hosting layer, so we must add our own TLS proxy in either option.
- **Verified (upstream README):** a production configuration is not a single documented command. The "PROD" make target doesn't start the math engine unless you add the right profile flag.
- **Inferred:** NTARI rounds will be small: one federation or all members, so tens to low hundreds of people and tens of comments. Plan for **4 GB RAM and 2 vCPUs**, with swap (disk space used as overflow memory). 2 GB is probably too tight for Postgres, the Node server, the Python math engine, the bridge and the proxy together, especially while Docker images build. R1 should measure real memory use on its running stack before Gate 1 fixes the size.
- **Inferred:** upstream changes fast. The math engine was rewritten from Clojure to Python, and a new participation client and AI pipeline were added. Pinning a commit (CLAUDE.md) matters more than the hosting choice. Upgrades need a test host, which is cheap to make on a VPS (copy and resize) and hard to make on a single home box.

### F3. Uptime and power/ISP risk over a 7-day window

- **Inferred:** a round runs for 7 days by default (PLAN.md §3, mirroring §12.5). Every hour of downtime is an hour members can't take part. Home connections and home power have no uptime guarantee, and NTARIHQ already has repeated restart problems (F1).
- **Inferred:** a mid-round reboot matters more than usual here. The proposed key policy keeps round keys out of backups. The simplest way to do that is to hold keys only in memory, so a reboot or power cut mid-round loses the key, and PLAN.md §3 says the round then "closes early and is rerun." On a home box, power cuts, Windows updates, Docker Desktop restarts and sleep are all realistic within a week. On a VPS, reboots are rare and mostly scheduled.
- **Inferred:** option (a) has two points of failure, the relay and the home box, plus the tunnel between them. Option (b) has one.

### F4. Data custody: who could see votes or link them to people

- **Inferred (from PLAN.md §3's design):** the bridge sends the single-use join link to the member in a private (ephemeral) Slack message, so Slack knows which member got which token. Anyone who can also see which token became which xid session can link a person to their votes. That covers:
  - the bridge host itself (trusted by design, and it doesn't log this);
  - **any service that terminates TLS in front of the bridge**.

  So it matters a great deal *where TLS is decrypted*.
- **Verified (Cloudflare docs; community sources):** Cloudflare Tunnel connects out from your server (Cloudflare docs). For ordinary web traffic, Cloudflare decrypts at its edge and re-encrypts toward your server, so it can see the content (community sources). **Inferred:** with Cloudflare Tunnel, Cloudflare would see join tokens, session cookies, xids and votes, plus visitor IP addresses. That brings a third party into the identity path, the same reason decision 000 ruled out Wix for the pages.
- **Verified (community sources):** a WireGuard relay can do **TLS passthrough**. The relay forwards encrypted traffic (layer 4, "mode tcp") and the proxy at home holds the certificate. The relay then sees only visitor IPs, timing and the requested hostname, never content. **Inferred:** this keeps option (a)'s custody advantage, but only if the relay is set up as passthrough, not as a TLS-terminating proxy as many guides show.
- **Inferred, option (b):** the VPS provider controls the hypervisor (the software running the virtual machine). In principle it could read the disk or memory, including round keys held in memory. That's the custody cost of renting. In practice large providers do this only under legal process. Key destruction at close still limits exposure to the open round.
- **Inferred, option (a):** NTARI has physical custody of the home machine. But that machine also holds SoHoLINK's signing key and member database. A compromise through the new internet-facing Pol.is/bridge stack could reach them, and the reverse is also true. That co-location is exactly the risk the maintainer declined for the mail server (F1).
- **Inferred (both options): "round keys never enter backups" needs design, not just policy.** Provider backups (DigitalOcean's are whole-disk images) and any whole-disk snapshot would capture a key file. So keys should live on a memory-only filesystem (`tmpfs`) or be otherwise excluded, and provider-level disk backups or snapshots should be **off**. Backups should be done in the app instead: a Postgres dump, a SQLite online backup and the configuration, all encrypted and copied off the machine. This is consistent with decision 000 item 6 (`BRIDGE_KEY_DIR` excluded from backups).

### F5. Backup and restore

- **Verified (internal notes):** NTARIHQ's current pattern is same-host dumps, untested restores and no off-site copy (F1). The disk is nearly full.
- **Verified (DigitalOcean docs):** Droplet backups cost 20% (weekly) or 30% (daily) of the Droplet price. They are whole-disk images, which conflicts with the key rule unless keys live in `tmpfs` (F4).
- **Inferred:** in either option, the backup that matters is:
  - a nightly encrypted `pg_dump` plus a SQLite backup, copied to off-site storage (for example object storage or a second NTARI-controlled machine);
  - a written, tested restore.

  On a VPS, a restore test means building a second VPS for an hour, which costs cents. On NTARIHQ there is no spare machine to restore onto.

### F6. Cost (prices checked 2026-10-12)

- **Verified (DigitalOcean pricing page), Basic Droplets:**
  - 2 GiB / 1 vCPU / 50 GiB: $12 per month;
  - 2 GiB / 2 vCPU / 60 GiB: $18 per month;
  - 4 GiB / 2 vCPU / 80 GiB: **$24 per month**.
- **Verified (Hetzner product page, specs only; the page didn't render prices):**
  - US regions (Ashburn, VA and Hillsboro, OR): CPX11 (2 vCPU / 2 GB) and CPX21 (3 vCPU / 4 GB);
  - EU: CPX22 (2 vCPU / 4 GB).

  **Reported by third parties, not verified:**
  - Hetzner raised cloud prices on 2026-06-15, with US CPX prices up to about 3× (privatedevops.com, northflank.com);
  - EU CX23 (2 vCPU / 4 GB) went from €3.99 to €5.49, and CPX22 to €19.49. The cheap CX line is reported "currently not available" for new orders;
  - US CPX31 (8 GB) is about €62.49.

  Treat Hetzner US prices as unconfirmed, and look them up in the Hetzner console before deciding.
- **Reported by third parties, not verified:** Akamai/Linode Shared 4 GB at $24 per month (Better Stack review, CostBench). Vultr Regular 4 GB at $20 per month (aggregators; vultr.com returned 403 to the fetch).
- **Verified (DigitalOcean nonprofit search results and pages):**
  - "DO for Nonprofits & Social Enterprises" (formerly Hollie's Hub for Good) is reported to offer up to $2,500 in one-time credits to US 501(c)(3)s, verified through Percent, with credits expiring one year after application.
  - DigitalOcean's own impact page confirmed only that the program exists ($529,500 donated in 2023). The per-organization amount comes from search-result summaries. **Confirm before relying on it.**
  - A separate DigitalOcean *open source* credits program was reported ended in October 2026. Don't confuse the two.
- **Verified (search):** no official Hetzner nonprofit program was found. Hetzner has sponsored some open-source projects on request.
- **Inferred, the cost of each option:**
  - **(a)** still needs a relay VPS. The smallest tier, about $4–6 per month, is enough because it only forwards traffic. Cloudflare Tunnel avoids that cost but fails on custody (F4) and DNS (F8). Option (a) also adds load to a home machine that is nearly out of disk, so a disk upgrade may be the real cost.
  - **(b)** costs about $20–24 per month for 4 GB, or about $290 per year, plus a few dollars a month for off-site backup storage. A one-year nonprofit credit would cover year one.

### F7. Operating burden for volunteers

- **Inferred:**
  - **(a)** means a home machine, a relay VPS, a WireGuard tunnel and a passthrough proxy setup, plus port sharing with Stalwart on 443. It runs inside Docker Desktop on Windows, which has a history of manual repairs after restarts (F1). Only someone with access to the home machine can fix it.
  - **(b)** is one Linux machine with Docker Engine (not Docker Desktop), a reverse proxy such as Caddy with automatic Let's Encrypt certificates, and a standard SSH login. Any volunteer can be given access, the setup can be scripted in Phase 2 (infrastructure as code), and the whole server can be rebuilt from scratch.
- **Inferred:** (b) also keeps this interim tool away from the JFA substrate work that NTARIHQ supports, which matches PLAN.md §1's "simplest option" rule.

### F8. Same-site domain layout and Wix DNS

- **Verified (DNS lookup, 2026-10-12):** `ntari.org` uses Wix nameservers (`ns14.wixdns.net`, `ns15.wixdns.net`). `soholink.org` uses Cloudflare nameservers.
- **Verified (Wix support articles):** for a domain on Wix nameservers, go to **Domains → Domain Actions → Manage DNS Records**, then add CNAME records in "CNAME (Aliases)" and A records with a host name such as `blog` to point a subdomain at an outside IP. If a domain is connected to Wix by "pointing" instead, changes are made at the domain host. ntari.org uses Wix nameservers, so the records are added in Wix. **Inferred (from a third-party guide):** don't type `@` in Wix's host field.
- **Inferred, layout:** both options can serve `polis.ntari.org` and `vote.ntari.org`, so the Pol.is iframe's cookies count as first-party (same registrable domain), as PLAN.md §3 requires.
  - **(b)** needs two A records in Wix pointing to the VPS IP.
  - **(a)** with a WireGuard relay needs two A records pointing to the relay's IP.
- **Verified (Cloudflare docs):** a Cloudflare Tunnel public hostname needs the domain's DNS records managed in the same Cloudflare account. A "partial (CNAME) setup", which leaves nameservers elsewhere, "is only available to customers on a Business or Enterprise plan." **Inferred:** a Cloudflare Tunnel on `*.ntari.org` would mean moving ntari.org's nameservers from Wix to Cloudflare, which could disrupt the website and email records, or paying for Business. Using `soholink.org` instead (already on Cloudflare) would work technically, but it puts NTARI governance under a product's brand.
- **Inferred, certificates:** Let's Encrypt can verify a server by HTTP on port 80 or by DNS records. There's no evidence Wix offers a DNS API for automated DNS checks, so the TLS proxy should use the HTTP check. In (a) that means the relay must pass through port 80 as well as 443. In (b) it just works.

### Comparison table

| Criterion | (a) NTARIHQ + outbound tunnel to a relay | (b) Small VPS running everything |
|---|---|---|
| Uptime over a 7-day window | Weaker: home power and ISP, two failure points, known restart fragility; a reboot loses in-memory round keys and forces a rerun | Stronger: data-center power and network, one failure point, rare reboots |
| Power and ISP risk | High: residential line, no known UPS or backup line | Low (provider's problem) |
| Backup and restore | Same-host dumps today, disk nearly full, no spare machine for restore tests | App-level encrypted dumps off the machine; restore test on a throwaway VPS; provider disk snapshots must be off (key rule) |
| Custody of votes | NTARI holds the hardware; good **if** the relay is passthrough (Cloudflare Tunnel would see plaintext) | Provider could in principle read disk or memory; no third party in the web path |
| Custody of round keys / no keys in backups | Achievable (`tmpfs`), but reboots are likelier | Achievable (`tmpfs`, provider snapshots off) |
| Blast radius | Shares a machine with SoHoLINK's signing key and member DB | Isolated; a compromise reaches only this tool |
| Cost | Relay about $4–6 per month, plus probably a disk upgrade; volunteer time | About $20–24 per month for 4 GB (possibly covered in year one by nonprofit credits) |
| Operating burden | Higher: two machines, tunnel, passthrough setup, port 443 shared with Stalwart, Docker Desktop on Windows, fixable only on site | Lower: one Linux box, Docker Engine, Caddy, scriptable, any volunteer can be given access |
| Same-site domains (`polis.`/`vote.ntari.org`) | Works with a WireGuard relay (A records in Wix); Cloudflare Tunnel needs ntari.org moved off Wix DNS | Works: two A records in Wix |
| Fit with JFA no-inbound-ports design | Matches | Doesn't match (443/80 open on the VPS), but the bridge is interim tooling, not JFA (PLAN.md §1) |

## Sources

Accessed 2026-10-12 unless noted.

**Repo files**
- `C:\Users\Jodson Graves\Documents\polis-bridge\PLAN.md` (§1–§3; §5 R6 and Gate 1)
- `C:\Users\Jodson Graves\Documents\polis-bridge\CLAUDE.md`
- `C:\Users\Jodson Graves\Documents\polis-bridge\docs\decisions\000-repo-and-stack.md`

**Internal notes** (read-only; folder `C:\Users\Jodson Graves\.claude\projects\C--Users-Jodson-Graves-Documents-NTARI-Official-Docs\memory\`)
- `netmon-monitoring.md`: host facts verified 2026-07-13, exposure finding 2026-09-11, weekly review 2026-10-11
- `stalwart-smtp-wiring.md`: Stalwart ports, scope decision 2026-07-14, residential IP
- `soholink-operator-readiness.md`: cloudflared tunnel, governance-console fragility, backups item 8
- `stack-status-2026-07-13.md`: Docker Desktop recovery
- `topology-ntari-os-interface.md`: NTARIHQ capacity constraint, "last stack the box takes"

**Upstream Pol.is** (`compdemocracy/polis`, branch `edge` @ `978fa11244532eb4efd44cbe27578e7ee2889f99`; `stable` @ `30367002aa26c8796fd58aa8acf4203735e943bd`)
- https://github.com/compdemocracy/polis
- https://raw.githubusercontent.com/compdemocracy/polis/edge/README.md
- https://raw.githubusercontent.com/compdemocracy/polis/edge/docker-compose.yml (memory limits around lines 208 and 391; math-python profile)
- https://raw.githubusercontent.com/compdemocracy/polis/edge/example.env
- https://raw.githubusercontent.com/compdemocracy/polis/edge/docs/scaling.md
- https://raw.githubusercontent.com/compdemocracy/polis/edge/docs/ssl.md

**VPS pricing and credits**
- https://www.digitalocean.com/pricing/droplets
- https://docs.digitalocean.com/products/backups/details/pricing/
- https://www.digitalocean.com/impact/nonprofits
- https://www.digitalocean.com/blog/driving-impact-do-for-nonprofits-social-enterprises (via search result)
- https://itsfoss.com/news/digitalocean-open-source-credits-end.md (via search result; third party)
- https://www.hetzner.com/cloud/regular-performance (specs only)
- https://docs.hetzner.com/cloud/servers/overview/ (IPv4 €0.50 per month)
- https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do (third party, 2026-06-15)
- https://northflank.com/blog/hetzner-cloud-server-price-increases (third party, 2026-06-17)
- https://betterstack.com/community/guides/web-servers/linode-akamai-review/ and https://costbench.com/software/cloud-infrastructure/linode (third party)
- https://www.costbench.com/software/cloud-infrastructure/vultr/ (third party; vultr.com/pricing returned 403)
- https://gitlab.com/fdroid/admin/-/issues/78 (asking hosts for sponsorship; via search result)

**Tunnels and TLS**
- https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/
- https://developers.cloudflare.com/dns/zone-setups/partial-setup/
- https://communities.stormux.org/post/22215/88850 and https://lemmy.amethyst.name/post/1097537/417125 (community sources on Cloudflare edge decryption)
- https://cavelab.dev/2021/03/vps-wireguard-iptables/ (WireGuard VPS relay pattern)
- https://lemmy.brendan.ie/comment/1678962 (TLS passthrough relay; community source)

**Wix DNS**
- https://support.wix.com/en/article/adding-or-update-cname-records-in-your-wix-account
- https://support.wix.com/en/article/connecting-a-wix-domain-to-an-external-site
- https://www.datahash.com/docs/signals/reference/subdomain/wix/ (third party; "@" gotcha)
- DNS lookups: `nslookup -type=NS ntari.org 1.1.1.1` and `nslookup -type=NS soholink.org 1.1.1.1`

## Recommendation

**Host the MVP on option (b): one small, dedicated Linux VPS, 4 GB RAM and 2 vCPUs, in a US region.** Serve it at `polis.ntari.org` and `vote.ntari.org` with two A records added in Wix's DNS manager.

Run it as follows:

- Docker Engine;
- Caddy for TLS, with automatic Let's Encrypt certificates;
- round keys on a memory-only filesystem (`tmpfs`);
- provider disk backups and snapshots **off**;
- nightly encrypted app-level backups (Postgres dump, SQLite backup, configuration) copied off the machine;
- a restore rehearsed on a throwaway VPS before the pilot.

Apply for DigitalOcean's nonprofit credits, or confirm Hetzner's current US prices, before choosing the provider.

**Why:** a week-long voting window needs a machine that stays up. NTARIHQ is a residential, Windows/Docker Desktop host with known restart fragility and about 4 GB of disk free. It already holds SoHoLINK's signing key and member database, and the maintainer has already declined to put an internet-facing service next to them. A VPS isolates this interim tool, any volunteer can run it, and it costs about $20–24 per month.

**Tradeoffs the board accepts with (b):**

1. **Custody.** The VPS provider could in principle read the disk or memory, including an open round's key. NTARI doesn't own the hardware.
2. **Not the JFA shape.** The VPS accepts inbound web traffic. That's acceptable because the bridge is interim tooling under P1-005, not a JFA implementation (PLAN.md §1), but it shouldn't be presented as matching the substrate design.
3. **Recurring cost.** About $290 per year, against near-zero cash for (a).

**If the board prefers (a)**, it's workable only with all of these conditions:

- a WireGuard relay doing **TLS passthrough** (not Cloudflare Tunnel, which would put Cloudflare in the identity path and also needs ntari.org's DNS moved off Wix);
- the disk problem fixed first;
- a UPS (battery backup);
- a Linux VM or container setup that doesn't share port 443 with Stalwart;
- an accepted risk of reruns after mid-round reboots.

**Open questions for Gate 1:**

1. **Is NTARIHQ Windows 11 or Ubuntu Server?** PLAN.md says Ubuntu, but the internal notes describe Windows. Is NetMon's machine the same box? (This changes option (a)'s effort.)
2. **Data residency.** Must vote data stay in the US? Is a German-owned provider (Hetzner, US data centers) acceptable, or only US-owned ones?
3. **Provider choice and budget.** Who approves about $24 per month? Should NTARI apply for DigitalOcean's nonprofit credits (reported up to $2,500, one year)?
4. **Who holds access.** Who holds the VPS root login and the provider account? Should two people hold it, for continuity?
5. **Off-site backup destination.** What storage, and who holds the decryption key? It must be separate from round keys, which are never backed up.
6. **Wix DNS editor.** Who has the Wix account access to add the two A records? Confirm the names `polis` and `vote`.
7. **Reboot policy during rounds.** Freeze automatic OS updates and reboots while a round is open, and accept rerun-on-key-loss otherwise?
8. **Size check.** Accept 4 GB provisionally, to be confirmed by R1's measured memory use of the pinned Pol.is stack. That stack's defaults cap the math engine at 16 GB, which must be lowered.
