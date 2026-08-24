# Showcase

This page is a set of reproducible starting points for evaluating Founder
Product Compiler. It deliberately uses repository fixtures rather than
claiming customer results or unsupported benchmark superiority.

## Canonical compilation

The canonical input at [`examples/canonical-input.json`](../examples/canonical-input.json)
contains a complete product brief. Compile it with the source CLI:

```bash
npm ci
npm run build
node dist/src/cli.js --input examples/canonical-input.json --out /tmp/fpc-showcase
```

The current `READY` output includes six JSON artifacts: Product IR, readiness,
executable specification, deterministic Goal DAG, diagnostics, and compilation
receipt. The v0 Product Judge helper is a readiness-based library decision
model; the CLI does not emit a `product-judge.json` artifact and does not yet
execute Code, Journey, or Thesis oracles against a finished codebase. The
fixture is intended to demonstrate the shape of the contract; adapt the brief
to your own product before implementation.

## A useful evaluation sequence

1. Run the canonical input and inspect the generated artifacts.
2. Remove one material product decision, such as the product promise.
3. Run the compiler again and compare the `NOT_READY` findings.
4. Restore the decision and confirm the output is deterministic across runs.
5. Give the resulting executable specification to Codex in the target project.

## What to share in a showcase

When adding a real example, include the product problem, a redacted input,
the readiness findings, and the resulting acceptance contract. Do not include
customer data, credentials, private briefs, or claims that cannot be reproduced
from the repository.

## Submit an example

Open a feature request or pull request with the `showcase` label. A good
example is small enough to run locally, names its assumptions, and shows how
the Product IR and Goal DAG preserve a user journey from brief to build.
