import type { HoldRef, SeatId, SeatState, Seconds } from "../domain/seat-state.ts";

export type { HoldRef };

export type SeatLookup =
  | { readonly tag: "stored"; readonly state: SeatState }
  | { readonly tag: "no-such-seat" };

export type Clock = {
  readonly now: () => Seconds;
  readonly advanceBy: (options: { readonly seconds: Seconds }) => Seconds;
};

export type SeatStore = {
  readonly read: (options: { readonly seatId: SeatId }) => SeatLookup;
  readonly write: (options: { readonly seatId: SeatId; readonly state: SeatState }) => void;
};

export type HoldReferences = {
  readonly next: () => HoldRef;
};

export type Configuration = {
  readonly inventory: readonly SeatId[];
  readonly holdDurationSeconds: Seconds;
};
