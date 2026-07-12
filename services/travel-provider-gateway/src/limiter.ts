type Job<T> = {
  operation: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export class FifoLimiter {
  private active = 0;
  private readonly queue: Array<Job<unknown>> = [];

  constructor(private readonly concurrency = 4) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError("Concurrency must be positive");
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ operation, resolve, reject } as Job<unknown>);
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.concurrency) {
      const job = this.queue.shift();
      if (job === undefined) return;
      this.active += 1;
      void job.operation().then(job.resolve, job.reject).finally(() => {
        this.active -= 1;
        this.drain();
      });
    }
  }
}
