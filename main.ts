// Dip-buy trend follower for btc-race-24h-20261123-0511.
//
// Idea: Bitcoin trends in bursts on 1-minute bars, and the pullbacks inside an
// uptrend are where the cheap entries live. This bot only ever buys a dip
// while the medium-term trend is up, then lets the position run with a
// take-profit and a trailing stop. It never chases a breakout, never sells
// short, and never trades against the trend.
//
//   Trend filter: EMA(20) of closes above EMA(96) of closes. Both EMAs are
//   seeded as the mean of their first span of closes, and the bot does not
//   trade until both are defined (96 bars in).
//   Entry (flat, no cooldown): the close dips at least 0.30% below EMA(20)
//   while the trend is up. One full-size buy: 100% of cash.
//   Exit (holding, whole position): the close falls 1.5% below the highest
//   close since entry (trailing stop), or 1.5% below the entry fill (hard
//   stop), or rises 3.0% above the entry fill (take-profit), or the trend
//   flips (EMA(20) below EMA(96)). After an exit, 10 bars of cooldown.
//   A full round trip costs about 26 bps in fees, slippage and impact, so
//   every trade is sized to catch a move an order of magnitude larger.
//
// Everything is a pure function of the bars: no clock, no randomness, no
// network, no files. The same bars always produce the same orders.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const FAST_SPAN = 20;
const SLOW_SPAN = 96;
const DIP_BPS = 30; // entry: close at least 0.30% below the fast EMA
const TRAIL_BPS = 150; // exit: 1.5% below the highest close since entry
const STOP_BPS = 150; // exit: 1.5% below the entry fill
const TAKE_BPS = 300; // exit: 3.0% above the entry fill
const COOLDOWN_BARS = 10; // bars to sit out after an exit
const MAX_SLIPPAGE_BPS = 200; // a 1-minute open rarely moves 2% from the close

// An EMA seeded as the mean of its first span of closes, then the usual
// 2 / (span + 1) recursion. Undefined until the span is full.
class Ema {
  readonly span: number;
  #sum = 0;
  #value: number | null = null;
  #seen = 0;

  constructor(span: number) {
    this.span = span;
  }

  get value(): number | null {
    return this.#value;
  }

  update(close: number): void {
    this.#seen++;
    if (this.#seen < this.span) {
      this.#sum += close;
      return;
    }
    if (this.#seen === this.span) {
      this.#sum += close;
      this.#value = this.#sum / this.span;
      return;
    }
    const k = 2 / (this.span + 1);
    this.#value = close * k + (this.#value as number) * (1 - k);
  }
}

const fast = new Ema(FAST_SPAN);
const slow = new Ema(SLOW_SPAN);
let entryPrice = 0; // the fill price of the open position, USDC per CBBTC
let peakClose = 0; // the highest close since entry
let cooldownLeft = 0;

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    if (state.warmingUp) return [];
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = Number(bar.c) / 1e8;

    // Fills decided on the previous batch land here: learn the entry fill
    // and start the cooldown after an exit fill.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        entryPrice = Number(fill.price) / 1e8;
        peakClose = close;
      } else if (fill.side === 'sell') {
        entryPrice = 0;
        peakClose = 0;
        cooldownLeft = COOLDOWN_BARS;
      }
    }

    fast.update(close);
    slow.update(close);
    const fastEma = fast.value;
    const slowEma = slow.value;
    if (fastEma === null || slowEma === null) return [];
    if (cooldownLeft > 0) cooldownLeft--;

    const held = state.positions.get(SYMBOL);
    const qty = held === undefined ? 0n : held.qty;

    // Fallback if a buy fill was never seen (it always is in the replay):
    // the position's cost basis, fees included, as an entry price.
    if (qty > 0n && entryPrice === 0 && held !== undefined) {
      entryPrice = Number(held.cost_quote_units) * 100 / Number(qty);
      peakClose = close;
    }

    if (qty === 0n) {
      // Flat: buy the dip, only while the trend is up.
      const uptrend = fastEma > slowEma;
      const dipped = close * 10000 < fastEma * (10000 - DIP_BPS);
      if (uptrend && dipped && cooldownLeft === 0 && state.cash > 0n) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Holding: track the peak and test every exit.
    if (close > peakClose) peakClose = close;
    const trailing = close * 10000 < peakClose * (10000 - TRAIL_BPS);
    const stopped = entryPrice > 0 && close * 10000 < entryPrice * (10000 - STOP_BPS);
    const taken = entryPrice > 0 && close * 10000 > entryPrice * (10000 + TAKE_BPS);
    const trendLost = fastEma < slowEma;
    if (trailing || stopped || taken || trendLost) {
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
