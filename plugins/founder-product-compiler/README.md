# Founder Product Compiler plugin

This Codex plugin invokes the local Founder Product Compiler skill. It is an
English-first, skills-only public package. Runtime requires no product account,
API key, network, or auth; it has no MCP, telemetry, or OpenAI endorsement.
Codex host marketplace installation may still request host authorization
because the marketplace metadata declares `ON_INSTALL`. It writes only
reviewable local artifacts and never deploys or mutates product code.

The verified release install command is
`codex plugin marketplace add plugtheliam/founder-product-compiler --ref 2a869c0a83f7547eb4e964b9b75543be2ec5d93a`.
The annotated `v0.1.0` tag is a convenience version tag for browsing and
release identification; the full 40-hex commit SHA above is the verified
installation target. Keep the full SHA pinned in install commands rather than
substituting a branch or tag. The root `RELEASE_COMMIT` marker records the
same verified SHA. The canonical structured input is
`assets/canonical-input.json`; the wrapper is
`scripts/founder-product-compiler.mjs`.
