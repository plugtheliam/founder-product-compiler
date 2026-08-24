# Founder Product Compiler

Founder Product Compiler turns a confirmed product brief into a deterministic,
reviewable build contract:

- Product IR and a hard readiness report;
- an executable specification and Charter-linked vertical-slice Goal DAG when
  the brief is `READY`; and
- partial Product IR, all blocking findings, diagnostics, and a compilation
  receipt when it is `NOT_READY`.

The public release is English-first, Apache-2.0 licensed, skills-only, and
local-only. Runtime requires no product account, API key, network, or auth; it
has no MCP server, telemetry, analytics, deployment, or OpenAI endorsement. In
short, there is no account, no network access, and no telemetry at runtime.
Codex host marketplace installation may still request host authorization because
the marketplace metadata declares `ON_INSTALL`. The compiler never mutates
product code or publishes generated artifacts.

## Install from the GitHub marketplace

In Codex:

1. Before publication is finalized, the versioned beta instructions are:

   ```text
   codex plugin marketplace add plugtheliam/founder-product-compiler --ref v0.1.0
   ```

2. Open `/plugins` and install `founder-product-compiler`.
3. Start a new session.
4. Invoke `$founder-product-compiler` with an attached or pasted JSON/YAML
   brief.

The `v0.1.0` reference is a versioned prepublication beta convenience only;
it is mutable and is not an immutable trust boundary. Before the first public
push, the release owner must create the release payload and record its exact
40-hex commit in a root `RELEASE_COMMIT` marker. The final public `main`
README will then be updated in a second docs commit to use
`--ref <that full commit SHA>` before the push. Do not infer or substitute a
hash here. The repository marketplace is the first public distribution
channel. A universal directory is a possible later distribution and is not
part of this release.

## Run the compiler locally

Requires Node.js 20 or newer.

```bash
npm ci
npm test
npm run build
node dist/src/cli.js --input examples/canonical-input.json --out .product/out
npm run validate:schemas -- .product/out
```

The CLI accepts JSON or YAML and writes six `READY` artifacts, or four partial
artifacts for `NOT_READY`. Exit codes are stable: `0` for `READY`, `2` for
`NOT_READY`, and `1` for malformed input, unsafe output, collisions, or other
errors. Existing artifacts require explicit `--force`; symlink targets and
symlink output directories are always refused.

The default public UX writes only to the requested local output directory. The
Codex skill defaults to `.product/founder-product-compiler/<slug>` and asks
for missing founder decisions before compiling prose.

## Development and release checks

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run build:plugin
npm run validate:public
npm run check:plugin
```

`npm run build:plugin` generates the tracked bundled runtime and schema copies
from the compiler source. `npm run check:plugin` fails if those generated files
are stale. The CI workflow runs clean installation, typecheck, tests, compiler
build, plugin build, public validation, parity, and the official plugin/skill
validators where available.

See [the architecture](docs/ARCHITECTURE.md), [diagnostic contract](docs/DIAGNOSTICS.md),
[examples](docs/EXAMPLES.md), and [the public release plan](docs/PUBLIC_RELEASE_PLAN.md).

## Publicity and safety

The compiler preserves founder decisions and does not invent promises,
journeys, or goals. It is a local planning tool, not a deployment system. See
[SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the public policies.
