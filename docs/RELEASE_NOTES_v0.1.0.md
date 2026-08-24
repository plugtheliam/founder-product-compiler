# Founder Product Compiler v0.1.0

Founder Product Compiler v0.1.0 is the first public, skills-only Codex plugin
release. It compiles founder intent into a validated build contract that a
coding agent can execute and review.

This note describes the immutable `v0.1.0` tag at commit
`2a869c0a83f7547eb4e964b9b75543be2ec5d93a`. The multilingual launch README,
showcase, roadmap, and community files were added after that tag on the
documentation tip; they are not claimed to be part of the v0.1.0 payload.

## Highlights

- Typed Product IR and schema-backed artifact validation.
- Readiness gating for missing or contradictory product decisions.
- Deterministic vertical-slice Goal DAG compilation.
- A readiness-based Product Judge decision helper in the TypeScript library.
- Local-first runtime with no MCP server, product account, network access, or
  telemetry required by the packaged compiler.
- English-first plugin and compiler artifacts.

The v0 CLI emits six JSON artifacts on a `READY` run: Product IR, readiness,
executable specification, Goal DAG, diagnostics, and compilation receipt. The
CLI does not emit `product-judge.json` and does not execute Code, Journey, or
Thesis oracles against a finished implementation in this release.

## Install safely

The verified installation target is the full commit SHA recorded in
[`RELEASE_COMMIT`](../RELEASE_COMMIT):

```text
codex plugin marketplace add plugtheliam/founder-product-compiler --ref 2a869c0a83f7547eb4e964b9b75543be2ec5d93a
```

The `v0.1.0` tag is provided for release identification and browsing. Use the
recorded full SHA when you need an immutable installation target.

## Verification

The public package includes source, schemas, tests, plugin manifests, and
validation scripts. Run the documented public checks before adapting it to a
project:

```bash
npm ci
npm run typecheck
npm test
npm run validate:public
```

This release is an initial public baseline. It does not claim benchmark
superiority, official endorsement, or guaranteed product outcomes.
