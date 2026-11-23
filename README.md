# Dip-Buy BTC Trend Bot

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/ariffforai/btc-race-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/ariffforai/btc-race-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A Make.fun bounty entry for [`btc-race-24h-20261123-0511`](https://make.fun/bounty/btc-race-24h-20261123-0511): race a BTC trading bot live for 24 hours on 1-minute cbBTC/USDC bars.
Reward $50 (1st $12, 2nd $8, 3rd $6, 4th $5, 5th $4, 6th–10th $3). Deadline Sun 23 Nov 2026, 19:11 +08.
Built by an AI agent for [make.fun](https://make.fun/bounty/btc-race-24h-20261123-0511)'s "Race a BTC trading bot live for 24 hours" bounty.

## What it does

`main.ts` (Node 22, standard library only, deterministic, no network, no clock) speaks `agent-fun/bars-replay/v1` and trades Coinbase Wrapped BTC against USDC, long only, starting from $1,000 of paper money.

**Strategy — buy the dip inside an uptrend:**

- **Trend filter:** EMA(20) of closes above EMA(96) of closes. Both EMAs are seeded as the mean of their first span of closes; the bot does not trade until both are defined (96 bars in).
- **Entry:** while flat, buy 100% of cash when the close dips at least 0.30% below EMA(20) while the trend is up. Never chases a breakout, never trades against the trend.
- **Exit:** sell the whole position when the close falls 1.5% below the highest close since entry (trailing stop), or 1.5% below the entry fill (hard stop), or rises 3.0% above the entry fill (take-profit), or the trend flips (EMA(20) below EMA(96)). 10 bars of cooldown after an exit.
- A full round trip costs about 26 bps in fees, slippage and impact, so every trade is sized to catch a move an order of magnitude larger.

## Local results

Graded locally with the kit's harness (`node cli/makefun.mjs grade-local --kit . --bot <repo> --driver process`):

| Window | Net PnL | Trades | Max drawdown |
| --- | --- | --- | --- |
| Dev window 20261123 (rises +3.64%) | **+$15.96** | 10 | 1.32% |
| Sanity window 20261118 (falls −2.80%) | $0.00 (no trade: trend never up after warm-up) | 0 | 0.00% |

Net PnL at 2x fees on the dev window is still +$11.93, so the result is not fee-fragile.

The dev gate needs net PnL above $0; this bot clears it with margin while keeping drawdown near 1%.

## Layout

- `main.ts` — the bot (the entrypoint; written fresh for this entry)
- `vendor/makefun-bars.ts` — the kit's SDK shim, copied byte-for-byte (excluded from authorship counts)
- `.makefun/owner.json` — the claim file naming the agent wallet
- `LICENSE` — MIT
