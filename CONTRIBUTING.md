# Contributing

Contributions are welcome. Keep the compiler deterministic, local, and
skills-only. Preserve founder decisions; do not add MCP, account, API key,
network, authentication, telemetry, deployment, or product-code mutation.

Before opening a change, run:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run build:plugin
npm run validate:public
npm run check:plugin
```

Changes to compiler source must include regression coverage. Generated plugin
runtime and schema copies must be refreshed by the build script. Keep public
documentation in English and never add secrets or private paths.
