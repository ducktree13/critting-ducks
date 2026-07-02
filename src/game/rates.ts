import { RATE_WINDOW_SEC } from "./balance";

// Rolling-rate tracker: ring-buffers (timestampMs, amount) samples, prunes to
// the window, and reports the windowed sum scaled to an hourly rate.
export class RateTracker {
  private samples: { t: number; amount: number }[] = [];

  constructor(private windowSec: number = RATE_WINDOW_SEC) {}

  add(nowMs: number, amount: number): void {
    this.samples.push({ t: nowMs, amount });
  }

  perHour(nowMs: number): number {
    const cutoff = nowMs - this.windowSec * 1000;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
    let sum = 0;
    for (const s of this.samples) sum += s.amount;
    return (sum / this.windowSec) * 3600;
  }
}
