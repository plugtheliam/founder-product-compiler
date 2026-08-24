# Security policy

Runtime is local-only and requires no product account, API key, network, or auth;
it has no telemetry. Codex host marketplace installation may still request host
authorization because marketplace metadata declares `ON_INSTALL`. Do not include secrets, credentials,
private paths, or raw authentication material in issues or patches.

## Local filesystem boundary

Input, receipt, and artifact reads first reject symlinks, non-regular files, and
oversized files with `lstat`, then read through a bounded file handle. On
platforms where Node exposes `O_NOFOLLOW`, the open also refuses a final-path
symlink and the handle is checked again before and after the bounded read. The
validator applies the same rule with a conservative 4 MiB artifact limit.

For output on POSIX platforms with directory-handle support, the CLI verifies
the requested output directory's real path and `(device, inode)`, opens that
directory with `O_DIRECTORY|O_NOFOLLOW` where available, changes into the
verified real directory, and verifies the cwd, handle, and requested path
again. The write phase uses validated basenames only. Consequently, an
ancestor rename or replacement cannot redirect a subsequent write to a
different directory inode; if the path no longer names the verified inode, the
CLI fails closed. No-force commits use a same-directory temporary file and an
atomic hard link, so a collision cannot be overwritten. Force commits use
`rename`, which replaces the directory entry and does not follow a target
symlink. Temporary files are removed on failure.

This is a POSIX same-host guarantee, not a general filesystem or durability
guarantee. Windows has no portable Node directory-handle `chdir` primitive in
this package, so it retains the path, realpath, regular-file, and rename
checks; a same-user concurrent process may still race an ancestor between
those checks. The package has no native dependency to hide that limitation.
The CLI's anchored write phase is synchronous and restores the caller cwd in a
`finally` block; callers embedding the source module must not invoke CLI
`main` concurrently in the same process because `process.chdir` is global.

For a security concern, open a private GitHub security advisory for
`plugtheliam/founder-product-compiler` when that feature is available. If it
is unavailable, open an issue containing only a concise, non-sensitive
description and request a private contact channel. Do not publish an exploit
before a fix is available.
