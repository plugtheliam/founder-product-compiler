# Examples

`examples/canonical-input.json` is a complete `READY` brief. Compile it with:

```bash
node dist/src/cli.js --input examples/canonical-input.json --out .product/example
```

To inspect a `NOT_READY` flow, copy the example, remove `promise`, and run the
same command. The compiler reports `MISSING_PRODUCT_PROMISE`, emits only the
partial bundle, and exits `2`.

The Codex skill accepts an attached or pasted brief. For prose, it first shows
the proposed structured fields and unresolved decisions; it compiles only
after the founder confirms those decisions.
