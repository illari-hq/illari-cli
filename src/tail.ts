/**
 * Keeps the last N bytes written to it. Used to capture a command's combined
 * stdout+stderr for the completion ping without holding the whole log in memory.
 * illari truncates the request body to ~10 KB, so the default matches that.
 */
export class TailBuffer {
  private chunks: Buffer[] = [];
  private size = 0;

  constructor(private readonly limit: number) {}

  write(chunk: Buffer | string): void {
    if (this.limit <= 0) return;
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    this.chunks.push(buf);
    this.size += buf.length;
    this.trim();
  }

  private trim(): void {
    while (this.size > this.limit && this.chunks.length > 0) {
      const first = this.chunks[0]!;
      const over = this.size - this.limit;
      if (first.length <= over) {
        this.chunks.shift();
        this.size -= first.length;
      } else {
        this.chunks[0] = first.subarray(over);
        this.size -= over;
      }
    }
  }

  toString(): string {
    return Buffer.concat(this.chunks, this.size).toString("utf8");
  }
}
