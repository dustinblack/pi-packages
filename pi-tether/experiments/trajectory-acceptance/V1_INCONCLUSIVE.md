# V1 result: inconclusive (private evidence only)

The v1 reported score of 3/15 is not an acceptance result and must not be used as a baseline. Review found that gold decisions used evidence later than the scored map horizon, the structural graph-diff classifier conflicted with the semantic movement definitions, critical gates were null/indeterminate, and the committed raw artifact exposed private transcript/request/reasoning content.

The private/unpushed branch was reset to `9c7927e`; former commits `607e943` and `f606d49` are not ancestors of this protocol. No raw v1 payload is retained in the reachable branch. The structural classifier that remains from the retained checkpoint is diagnostic only and is retired from acceptance.

Before reset, the evidence was copied byte-for-byte to the mode-0700 directory `/private/tmp/todo-008-trajectory/private-v1-inconclusive/`; files and its `SHA256SUMS` are mode 0600. The private hashes are:

| Private file | SHA-256 |
|---|---|
| `raw-predictions.json` | `d99a7e270b6ebf9aea85b837b8cf13631abcfdd8d7ce59532518522c3e3aaa86` |
| `raw-replay-status.json` | `e51ac940a78ec48444e2dcee4208a40ce1436dd1a9366b860dc28d07c0addac0` |
| `score.json` | `f4c1b77a9fa09d38bb08af6b2f52e59816cbec11fed1d7d2802fb47012ff826c` |
| `SCORE.md` | `fac301df34612a7f3cda25fa12b588c519e093b260ae2822c1deacfb87a1687e` |

These hashes document preservation, not endorsement. Raw files stay private and must not be recommitted or placed in scorer packets.
