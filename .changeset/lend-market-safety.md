---
'@eth-optimism/actions-sdk': minor
---

Validate lend caller assets against market underlyings before approvals,
enforce lend market blocklists, and filter caller-supplied lend/borrow market
reads through configured allowlists.

Market allowlists are now required for these lend and borrow paths. Empty or
omitted allowlists fail closed, and caller-supplied `getMarkets({ markets })`
overrides can only narrow configured allowlists.
