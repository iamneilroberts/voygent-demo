import { encodeSse, type ServerEvent } from "../../shared/events";

export class SseMultiplexer {
  private encoder = new TextEncoder();
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private closed = false;
  readonly readable: ReadableStream<Uint8Array>;

  constructor() {
    this.readable = new ReadableStream<Uint8Array>({
      start: (c) => { this.controller = c; },
      cancel: () => { this.closed = true; },
    });
  }
  /** Enqueue an event. No-ops (returns false) once the stream is closed or the consumer has gone away. */
  send(ev: ServerEvent): boolean {
    if (this.closed) return false;
    try {
      this.controller.enqueue(this.encoder.encode(encodeSse(ev)));
      return true;
    } catch {
      this.closed = true; // consumer cancelled / controller already closed
      return false;
    }
  }
  /** Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.controller.close(); } catch { /* already closed */ }
  }
}
