# Founder Product Compiler plugin

This Codex plugin invokes the local Founder Product Compiler skill. It is an
English-first, skills-only public package. Runtime requires no product account,
API key, network, or auth; it has no MCP, telemetry, or OpenAI endorsement.
Codex host marketplace installation may still request host authorization
because the marketplace metadata declares `ON_INSTALL`. It writes only
reviewable local artifacts and never deploys or mutates product code.

The prepublication beta install command is
`codex plugin marketplace add plugtheliam/founder-product-compiler --ref v0.1.0`.
The `v0.1.0` reference is mutable and is not an immutable trust boundary.
Before the first public push, the release owner must record the first release
payload's exact 40-hex commit in the root `RELEASE_COMMIT` marker, then update
the final public `main` README in a second docs commit to pin that full commit
SHA before pushing. The canonical structured input is
`assets/canonical-input.json`; the wrapper is
`scripts/founder-product-compiler.mjs`.
