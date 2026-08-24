# Diagnostics and exit contract

Every diagnostic has a stable `code`, `path`, `severity`, and `message`.
Errors are grouped in the readiness report so a founder can resolve blocking
decisions together.

| Outcome | Exit | Artifacts |
| --- | ---: | --- |
| `READY` | `0` | Product IR, readiness, executable specification, Goal DAG, diagnostics, receipt |
| `NOT_READY` | `2` | Partial Product IR, readiness, diagnostics, receipt |
| Input/output/compiler error | `1` | No claimed output bundle; a machine-readable stderr diagnostic |

`--force` is required to replace existing regular artifact files. Symlinked
artifact targets, any existing symlinked ancestor of the output directory, and
symlinked output directories fail closed. Missing output directories are
created one component at a time and canonical output resolution is checked
before and after writes. The wrapper validates every emitted artifact against
the bundled JSON schemas before returning `0` or `2`.

Untrusted JSON/YAML input is bounded to 1 MiB, depth 64, 10,000 nodes, 2,000
collections, 100,000 characters per string, 1 MiB of total string bytes, and
100 YAML aliases. Errors expose only safe relative names or basenames and do
not include parser internals or absolute source paths. Input and emitted
artifact reads are bounded and handle-verified. See [the security policy](../SECURITY.md)
for the exact POSIX output-directory guarantee and the Windows/same-user
concurrent-process residual risk.
