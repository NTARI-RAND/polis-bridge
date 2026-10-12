<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# polis-bridge

**Status: bootstrap (Phase 0). Nothing runs yet.**

polis-bridge connects NTARI's Slack workspace to a self-hosted [Pol.is](https://github.com/compdemocracy/polis) conversation:

- **Slack** confirms that someone is an eligible member.
- **Pol.is** hosts the deliberation and draws the opinion map.
- **The bridge** joins the two. Each vote is tied to an eligible member, but only through a pseudonym that changes every round. Pol.is never learns anyone's name or Slack account.

A Pol.is round *informs* a decision. Binding votes still happen under NTARI's bylaws.

This is interim tooling under draft policy P1-005. It is not an implementation of the Janus-Facing Architecture (JFA) and is not JFA-conformant.

## Where things are

- [PLAN.md](PLAN.md): the research and development plan, its phases and its decision gates.
- [docs/STATUS.md](docs/STATUS.md): the current phase and what it's waiting on.
- [docs/decisions/](docs/decisions/): decisions put to the maintainer and the board.
- [docs/research/](docs/research/): research notes from Phase 1.

## License

Copyright (C) 2026 Network Theory Applied Research Institute, Inc.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either **version 3 of the License, or (at your option) any later version** (`AGPL-3.0-or-later`). See [LICENSE](LICENSE).

Because the bridge is used over a network, the AGPL requires that anyone running a modified copy offers its source to the people who use it. The bridge's web pages link to this repository for that reason.
