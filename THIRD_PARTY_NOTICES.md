# Third-party notices

Runtime dependencies are installed from the npm registry during development
and CI according to the lockfile. The public package does not call those
services at runtime.

- `yaml` — YAML parsing, ISC license.
- `ajv` — JSON Schema validation, MIT license.
- `typescript` — TypeScript compiler, Apache-2.0 license.
- `tsx` — TypeScript execution support, MIT license.
- `esbuild` — JavaScript bundler, MIT license.
- `@types/node` — Node.js type declarations, MIT license.

The release bundle embeds the runtime portions of `yaml`, `ajv`,
`fast-deep-equal`, `fast-uri`, and `json-schema-traverse` (including their
transitive schema-validation helpers). Their complete applicable license texts
are shipped in
`plugins/founder-product-compiler/THIRD_PARTY_NOTICES.md` next to the bundled
runtime.

The complete dependency metadata and integrity records are in
`package-lock.json`. Users should consult each dependency's published license
for the version installed by that lockfile.
