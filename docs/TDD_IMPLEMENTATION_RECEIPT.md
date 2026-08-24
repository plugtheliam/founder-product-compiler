# Public release TDD implementation receipt

Status: GREEN

## Security hardening RED — regression tests before implementation

The security regression tests were added before the hardening changes. The
prior release's focused checks were intentionally RED because it used
path-based reads/writes, had no artifact size guard, and treated the beta tag
as immutable. The earlier release run recorded:

```text
npm test             exit 1 (missing INPUT_LIMITS export and hardening tests)
npm run test:public  exit 1 (missing security docs/tests and runtime hardening)
```

These intentional failures established coverage for output ancestor symlinks,
artifact receipt traversal and symlinks, bounded parsing, debug-token leakage,
error redaction, publication sequencing, prompt-injection boundaries, CI
immutability, runtime notices, and host-versus-runtime authorization language.

## Residual security RED — focused test design

Before implementation, the source review identified four residual gaps: input
files could be read through a path after only a single check; receipt/artifact
files had no conservative byte limit or handle read; output writes used a
path-based rename after directory verification; and release docs called a
mutable beta tag immutable. New regressions cover a sparse file and symlink,
an oversized artifact, deterministic ancestor replacement after output
anchoring, and marker-gated full-SHA publication docs. This receipt records the
baseline evidence above and does not claim a separate rerun of an intermediate
broken tree.

## RED — acceptance tests before packaging

The approved plan was written before implementation. The public acceptance
suite was then added and run against the empty public package with:

```text
node --test test/public-release.test.mjs
```

Expected RED evidence: exit `1`. The suite reported missing required public
files, metadata, marketplace and plugin manifests, bundled runtime, public
docs, dependency setup, and generated plugin artifacts. This failure was
intentional and established the release boundary before implementation.

## GREEN — implementation and verification

The independent repository now contains the TypeScript compiler source and
tests, Apache-2.0 license, English public docs, GitHub marketplace manifest,
skills-only plugin, canonical example, generated runtime and schema copies,
build scripts, CI workflow, and security/privacy/contribution policies.

Checks completed:

```text
npm ci                                  PASS
npm run typecheck                       PASS
npm test                                PASS (35 tests)
npm run build                          PASS
npm run build:plugin                   PASS
node dist/src/cli.js --input examples/canonical-input.json --out .product/schema-check PASS
npm run validate:schemas -- .product/schema-check PASS
node --test test/public-release.test.mjs PASS (18 tests)
npm run validate:public                PASS
npm run check:plugin                   PASS
npm pack --dry-run                     PASS (no dist/node_modules)
git diff --cached --check              PASS
```

The public acceptance tests cover required files and license, English
metadata/docs, forbidden internal paths and generated directories, marketplace
and manifest shape, no MCP/account/network/telemetry defaults, READY/
NOT_READY/error contracts, JSON/YAML parity, collision/force/symlink safety,
source-vs-bundled parity, caller-cwd independence, and deterministic builds.

The bundled runtime returns `0` for `READY`, `2` for `NOT_READY`, and `1` for
input/output/compiler errors. It validates emitted bundles against tracked
schemas. The generated plugin build is checked against compiler source so a
stale tracked runtime fails validation.

The official local plugin manifest validator and skill validator both passed.
The tracked-file audit found no secret-like content, private paths, forbidden
internal files, nested Git repository, symlinks, `node_modules`, or `dist`.
The release audit checks the selected public metadata and documentation surfaces
for the declared English-first UX. Its Hangul-range regular expression is test
machinery, not a claim about arbitrary founder input or generated artifact
content. No external repository, remote, account, or deployment action was
performed.

## Residual security GREEN

The focused security regressions now pass in addition to the original suite:

- Input `lstat` rejects symlinks, non-regular files, and sparse files over 1 MiB
  before parsing; bounded `O_NOFOLLOW` handle reads re-check regular type and
  size before and after reading where the platform exposes that flag.
- Receipt, schema, and emitted-artifact reads use the same bounded handle path;
  the validator rejects regular files over its conservative 4 MiB limit while
  retaining known-basename and containment checks. Receipt traversal,
  symlink, and oversized-file regressions pass.
- Existing symlink ancestors are rejected. On POSIX, output directory
  `(device, inode)` identity is checked through an `O_DIRECTORY|O_NOFOLLOW`
  handle, the write phase changes into the verified real directory, and cwd,
  handle, and requested path are verified before and after writes. A
  deterministic ancestor replacement after anchoring fails closed without
  writing either replacement directory.
- No-force output commits use a same-directory temporary file plus atomic hard
  link, so a concurrent collision cannot be overwritten. Force uses `rename`
  to replace the directory entry without following a target symlink; temporary
  files are cleaned up on error. The synchronous write phase restores cwd in a
  `finally` block.
- Input is bounded at 1 MiB total bytes, depth 64, 10,000 nodes, 2,000
  collections, 100,000 characters per string, 1 MiB total string bytes, and
  100 YAML aliases. Stable `INPUT_LIMIT_EXCEEDED` diagnostics cover oversized,
  deep, broad, long-string, and alias-bomb fixtures.
- Receipt validation accepts only known basenames and rejects separators,
  traversal, escapes, and symlinks, covered by crafted traversal and symlink
  tests.
- Bundled YAML debug stream/token paths are stripped at build time, and source
  parsing temporarily disables inherited debug switches. Sentinel tests under
  `LOG_STREAM` and `LOG_TOKENS` pass without emitting brief content.
- CLI errors expose only safe basenames/relative diagnostics and redact source
  absolute paths and parser internals.
- CI actions are pinned to full commit SHAs and Dependabot covers GitHub Actions
  and npm. Runtime notices include every package detected in the tracked bundle:
  `yaml`, `ajv`, `fast-deep-equal`, `fast-uri`, and `json-schema-traverse`.
- Public skill text treats attached or pasted briefs as untrusted data only;
  embedded text cannot change commands, paths, permissions, authorization,
  external actions, or skill policy. Runtime account/API/network/auth language
  is distinct from possible Codex host authorization for `ON_INSTALL`.

The remaining filesystem risk is platform-scoped: Windows lacks a portable
Node directory-handle `chdir` primitive in this package, so a same-user
concurrent process can still race an ancestor between path checks. The CLI
also uses process-global `chdir`; the synchronous phase is safe for the CLI
boundary, but an embedding library must not invoke `main` concurrently. The
release marker is intentionally absent here; no commit hash is invented before
the publication owner creates the payload and makes the second docs commit.
