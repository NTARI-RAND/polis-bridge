<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# 002: An NTARI-owned server from government surplus

- **Status:** proposed, for the founder board alongside Gate 1
- **Proposed by:** Jodson Graves (maintainer), 2026-10-12
- **Replaces:** the hosting recommendation in R6 (`docs/research/R6-hosting.md`), which proposed renting a server (a VPS)
- **Scope:** wider than the bridge. It is NTARI's first general-purpose server, and the bridge is its first tenant.

## The proposal

Buy a used server through government surplus auctions such as [GovDeals.com](https://www.govdeals.com/). Host it at a member's home or at an office. Split it into separate virtual machines so the bridge and future NTARI projects each get their own isolated space.

## Why own instead of rent

- **NTARI will keep needing server space.** A VPS is paid every month, forever, for each project. A server bought once can host many projects.
- **Custody.** R6's main tradeoff for renting was that the hosting company could in principle read the server, including an open round's key. On hardware NTARI owns, only NTARI has the machine.
- **Fit with the JFA substrate.** With the connection design below, the server takes no inbound connections. That is the substrate's no-inbound-ports design, which a VPS couldn't match.
- **Cost over time.** It's a one-time purchase plus power, against about $290 a year, per project, for a VPS (estimates below).

## What to buy

| Part | Proposal | Why |
|---|---|---|
| Form | A **tower** server, not a rack server | Rack servers are loud and need a rack. Towers are built for offices. Dell's 13th-generation tower figures are about 27 dBA at idle, roughly a quiet room ([Dell acoustics sheet](https://pcserverandparts.com/content/Spec%20Sheets/Servers/Dell/Dell%20PowerEdge%20T630/Dell%2013G%20PowerEdge%20Acoustical%20Performance%20and%20Dependencies.pdf)) |
| Models to watch for | Dell PowerEdge T430, T630, T440 or T640; HPE ProLiant ML350 Gen9 or Gen10; Lenovo ThinkSystem ST550 | Common in government offices, well documented, and spare parts are cheap |
| Processor | 1–2 Intel Xeon chips, 8+ cores in total | Pol.is plus the bridge used about 240 MB of memory in R1, so most of the machine is for future projects |
| Memory | 64 GB or more (ECC, which corrects memory errors) | Room for several virtual machines |
| Storage | 2 new SSDs as a mirror, so either can fail without data loss | **Inferred:** government surplus servers often arrive without drives, removed for data security, so budget for new ones |
| Power | Two power supplies if possible | One can fail without stopping the server |
| Remote management | Dell iDRAC or HPE iLO | Lets an admin restart or repair the machine remotely, without being in the room |

**Power use.** A 13th-generation Dell tower has been measured at about 48 W idle in a lab; owners report 100–150 W in practice ([SPEC result](https://spec.cs.miami.edu/power_ssj2008/results/res2015q1/power_ssj2008-20150302-00688-power.html), [Dell community](https://www.dell.com/community/en/conversations/power-cooling/loud-psu-fans/697a4da0918dc91cb4bdd6af)). At about 120 W around the clock, that's about 1,050 kWh a year, roughly **$130 a year** at about $0.12/kWh (**Inferred**; check the host's actual rate).

**Noise.** One owner reports the power-supply fans running constantly at low load. Listen to it, or ask the seller, before choosing a home location.

## Software

- **Proxmox VE** (free and open source) splits the server into virtual machines.
- The **bridge gets its own virtual machine**, so nothing else shares its memory or disk. That matters because round keys live only in memory (decision 001, §6).
- Future projects each get their own virtual machine.

## How the outside world reaches it

Home internet usually can't host a public website directly:
- the home's address changes from time to time;
- some providers share one address among many homes (called CGNAT);
- many residential plans forbid or block running servers.

None of this was checked for any specific provider (**Inferred**).

**Proposal:** keep the connection **outbound-only**.
- The server opens an encrypted WireGuard tunnel out to a tiny rented relay, about $4–6 a month.
- The relay only forwards encrypted traffic (TLS passthrough). It can't read it, because the security certificates live on NTARI's server, not the relay.
- `polis.ntari.org` and `vote.ntari.org` point at the relay through Wix DNS.
- **Result:** no ports open at the home or office, no fixed address needed, and the relay company can't see who voted how. Cloudflare Tunnel stays ruled out, because it decrypts traffic.

The same relay can serve every future project on the server.

## Home or office

| | Member's home | Office |
|---|---|---|
| Internet | Residential: terms may forbid servers, outages more likely | Often business service with better terms; check the lease and the IT rules |
| Power | Home outages; needs a battery backup (UPS) | Often steadier; still needs a UPS |
| Physical security | One household; who else can reach the machine? | Locked room possible; who has keys? |
| Noise and heat | Matters in living space | Usually fine |
| Continuity | Tied to one person; what happens if they move or leave? | Tied to the lease |

**Recommend an office if one is available.** Either way, the host signs a short custody agreement (below).

## Governance and ownership

1. **Purchase by NTARI**, approved under NTARI's spending rules, with the receipt kept. GovDeals sales are generally final, "as is, where is" (**Inferred** from state surplus terms; check each listing). Budget for pickup or freight.
2. **Asset register.** Record the server as NTARI property: serial number, purchase date and price, location.
3. **Custody agreement with the host**, covering:
   - NTARI owns the machine;
   - the host gives physical access only to named admins;
   - power and internet are provided as agreed (and whether NTARI reimburses power);
   - notice and return if the host moves or leaves.
4. **Two admins** hold the login credentials, for continuity.
5. **Insurance:** confirm whether NTARI's coverage, or the host's, covers the equipment off-site.

## Costs (estimates, to confirm)

| Item | One-time | Yearly |
|---|---|---|
| Server at auction (**Inferred**, varies widely) | $150–600 | |
| 2 new SSDs | $150–300 | |
| Memory top-up, if needed | $0–150 | |
| UPS battery backup | $150–250 | |
| Freight or pickup | $0–150 | |
| Relay VPS | | $50–75 |
| Electricity (about 120 W) | | ~$130 |
| **Total** | **~$450–1,450** | **~$180–205** |

Compare R6's VPS at about $290 a year for the bridge alone, with each future project adding its own.

## Risks, stated plainly

- **Used hardware, no warranty.** Parts will fail eventually. The drive mirror, two power supplies and off-site backups limit the damage. Keep a spare-parts budget.
- **One machine, one location.** A power or internet outage takes everything down. For a deliberation round, that means the round closes early and is rerun (decision 001, §6). Freeze reboots and updates while a round is open.
- **Volunteer operations.** Someone has to apply security updates and watch the machine. That's more work than a managed VPS.
- **The host's household or office** sits physically next to vote data while a round is open. The custody agreement and memory-only round keys reduce this, but don't remove it.
- **Backups off-site.** Encrypted copies go somewhere other than the server's location. Round keys are never backed up.

## Effect on Gate 1

- Decision 001, §2 (host) becomes: **an NTARI-owned surplus server, with the bridge in its own virtual machine, reached through an outbound-only relay doing TLS passthrough.**
- Decision 001, §14 adds:
  - who buys it and who approves the budget;
  - home or office, and who hosts;
  - the custody agreement;
  - who the two admins are.

## Decision

_(founder board: approved / approved with changes / rejected, names, date)_
