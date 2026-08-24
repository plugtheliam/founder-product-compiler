# Translation Guide

The root [`README.md`](../README.md) is the canonical English source. Localized
README files live under `docs/i18n/`:

| Locale | File | Language |
| --- | --- | --- |
| `ko` | [`README.ko.md`](i18n/README.ko.md) | 한국어 |
| `ja` | [`README.ja.md`](i18n/README.ja.md) | 日本語 |
| `zh-CN` | [`README.zh-CN.md`](i18n/README.zh-CN.md) | 简体中文 |
| `es` | [`README.es.md`](i18n/README.es.md) | Español |

## Source of truth

- English is the source of truth for product claims, section order, commands,
  release identifiers, security statements, and compatibility boundaries.
- A translation must never introduce a stronger promise than the English source.
  In particular, do not turn the Fable comparison into an unverified claim that
  the compiler automatically produces a better product.
- Keep code blocks, shell commands, paths, filenames, JSON/YAML keys, product
  names, `READY`/`NOT_READY`, `Product IR`, `Goal DAG`, and other technical
  identifiers unchanged unless a localized sentence needs to explain them.
- Preserve the verified install SHA and `v0.1.0` release reference exactly.
- Preserve the local-only, no-account, no-network, no-MCP, no-telemetry, and
  Apache-2.0 facts. Translate the surrounding prose naturally.

## Localization rules

- Translate for native readers; do not translate word-for-word.
- Keep the founder-first narrative in this order:
  1. Build beyond Fable
  2. What the founder gains
  3. Before / After
  4. How it works
  5. Why it is different
  6. Start in 60 seconds
  7. Trust and safety
  8. Compatibility and limitations
  9. Roadmap
  10. Development and release checks
  11. Contributing
  12. License
- Keep `Before / After` as a recognizable cross-language anchor.
- Use the language switcher at the top of every localized README. Each locale
  must link to the English README and all four localized files.
- Prefer the established technical term when a literal translation would make
  the command or concept ambiguous. Explain it in the local language instead.

## Update workflow

1. Update the English `README.md` first.
2. Update every file in `docs/i18n/` in the same pull request when the change
   affects product claims, installation, safety, compatibility, or section order.
3. Run the documentation tests:

   ```bash
   node --test test/readme.test.mjs
   ```

4. Run the public release checks and whitespace check before opening the pull
   request:

   ```bash
   npm run test:public
   git diff --check
   ```

5. Ask a native reviewer for any user-facing copy that materially changes the
   product promise. Keep the English README authoritative when reviewers find
   a factual conflict.

The README parity tests enforce required headings, canonical section order,
cross-language navigation, the immutable install SHA, the `v0.1.0` release
reference, and translated safety/licensing claims.
