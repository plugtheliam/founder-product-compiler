# Founder Product Compiler — Public Release Plan

Status: approved implementation plan
Repository: `https://github.com/plugtheliam/founder-product-compiler`
Publisher: `plugtheliam`
License: Apache-2.0

## Release boundary

This repository is the independent public distribution of the Founder Product
Compiler. The compiler source, tests, schemas, examples, documentation, and
the generated end-user Codex plugin are kept together so the source compiler is
canonical and the tracked plugin bundle is reproducible.

The release is skills-only. Runtime contains no MCP server, MCP configuration,
product account, API key, network call, telemetry, analytics, or remote runtime
dependency. Codex host marketplace installation may still request host
authorization because the marketplace metadata declares `ON_INSTALL`. The public UX and all public metadata and docs
are English by default. Generated artifacts are deterministic JSON files,
written only to a user-selected local output directory (the documented default
is repo-local), and never mutate product code, publish, deploy, or send data.

## Distribution and packaging

The first distribution channel is the GitHub repository marketplace. The
verified release install command is:

```text
codex plugin marketplace add plugtheliam/founder-product-compiler --ref 2a869c0a83f7547eb4e964b9b75543be2ec5d93a
```

The annotated `v0.1.0` tag is a convenience version tag for browsing and
release identification. The full 40-hex commit SHA above is the verified
installation target; copied install commands must keep that SHA and must not
substitute a branch or tag. The root `RELEASE_COMMIT` marker records the same
verified SHA. The repository marketplace source remains the required
repository-relative path `./plugins/founder-product-compiler` in
`.agents/plugins/marketplace.json`.

They then use `/plugins` to install `founder-product-compiler`, start a new
session, and invoke `$founder-product-compiler`. A universal directory or
additional marketplaces may be considered later after the GitHub marketplace
release has real-world validation; that is explicitly outside this release.

The repository layout is intentionally small:

- root TypeScript compiler source, tests, package metadata, and schemas;
- `.agents/plugins/marketplace.json` with the public marketplace shape;
- `plugins/founder-product-compiler/` containing `.codex-plugin/plugin.json`,
  the English skill, scripts, runtime, schemas, and assets;
- build and validation scripts that copy/generate the tracked plugin bundle
  from compiler source and fail when generated artifacts are stale.

The plugin manifest uses publisher identity `plugtheliam`, the public GitHub
repository URL, and Apache-2.0 metadata. It must not imply OpenAI endorsement.

## Quality, CI, and security gates

Every change must pass npm clean install, public validation, typecheck, tests,
compiler build, plugin build, source-vs-bundled-plugin parity, and generated
artifact freshness checks in GitHub Actions. The local release check also runs
the official Codex plugin and skill validators when available.

Acceptance coverage includes:

- required public files and license;
- English public metadata and docs;
- absence of internal paths/names, private project-state/session/receipt files,
  and private planning attachments, nested Git repositories, symlinks,
  `node_modules`, and `dist` output;
- marketplace and plugin manifest shape;
- explicit no-MCP, no-auth, no-network, and no-telemetry claims;
- READY, NOT_READY, and error exit/output contracts;
- JSON/YAML parity;
- collision, explicit-force, and symlink protections;
- source-vs-bundled-plugin parity;
- clean-checkout and current-working-directory independence; and
- deterministic build and runtime output where timestamps are not identity
  fields.

The repository must never contain credentials, API keys, private paths, raw
authentication material, or generated dependency/build directories. Security
reports belong in the public security policy, not in a private issue channel.
The release includes contribution guidance, a code of conduct, changelog,
privacy statement, and third-party notices, all in English.

## Release sequence

1. Land this plan before public packaging work.
2. Add the public acceptance tests and capture their intentional RED result.
3. Implement the independent source/package/docs layout and generated bundle.
4. Run the full local checks and capture GREEN evidence without private
   absolute paths in the receipt.
5. Review the tracked-file scan, diff whitespace, and validator output.
6. Only after this local release is accepted may the repository be published by
   an explicitly authorized owner; this task performs no external write.

## Non-goals

This release does not include private project-state files, sessions, receipts, internal
blueprints or work orders, personal marketplace files, private attachments,
OpenAI product endorsement, MCP integrations, telemetry, network services,
runtime autonomy enforcement, deployment, or a universal directory.
