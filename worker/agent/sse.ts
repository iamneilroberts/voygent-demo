import { encodeSse, type ServerEvent } from "../../shared/events";

export class SseMultiplexer {
  private encoder = new TextEncoder();
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  readonly readable: ReadableStream<Uint8Array>;

  constructor() {
    this.readable = new ReadableStream<Uint8Array>({
      start: (c) => { this.controller = c; },
    });
  }
  send(ev: ServerEvent): void {
    this.controller.enqueue(this.encoder.encode(encodeSse(ev)));
  }
  close(): void { this.controller.close(); }
}
