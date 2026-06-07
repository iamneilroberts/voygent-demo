import type { ServerEvent } from "../../../shared/events";

export type Frame =
  | { delayMs: number; kind: "user"; text: string }        // push user msg + assistant placeholder; busy=true
  | { delayMs: number; kind: "event"; event: ServerEvent } // run through the shared reducer
  | { delayMs: number; kind: "turn-end" };                 // busy=false

export interface Recording {
  skin: "claude";
  trip: string;
  frames: Frame[];
}
