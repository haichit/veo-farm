// Semaphore + RateLimiter primitives.
// Reference: SPEC_REPLICA_BACKEND.md section 18.14.

export class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {
    if (maxConcurrent < 1) throw new Error('Semaphore: maxConcurrent must be >= 1');
  }

  async acquire(): Promise<void> {
    if (this.current < this.maxConcurrent) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    if (this.queue.length > 0) {
      this.queue.shift()!();
    } else {
      this.current = Math.max(0, this.current - 1);
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export class RateLimiter {
  private lastDispatchedAt = 0;
  private _lock = new Semaphore(1);

  constructor(private minDelayMs: number) {}

  async throttle(): Promise<void> {
    await this._lock.acquire();
    try {
      const now = Date.now();
      const wait = this.lastDispatchedAt + this.minDelayMs - now;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastDispatchedAt = Date.now();
    } finally {
      this._lock.release();
    }
  }
}
