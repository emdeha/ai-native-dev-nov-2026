import {
  free,
  granted,
  hasReached,
  refused,
  type BookerName,
  type HoldRef,
  type Outcome,
  type SeatState,
  type Seconds,
} from "./seat-state.ts";

export const view = (options: { readonly stored: SeatState; readonly now: Seconds }): SeatState =>
  options.stored.status === "held" && hasReached({ clock: options.now, deadline: options.stored.hold.deadline })
    ? free
    : options.stored;

export type HoldCommand = {
  readonly holder: BookerName;
  readonly reference: HoldRef;
  readonly deadline: Seconds;
};

export const step = (options: {
  readonly stored: SeatState;
  readonly now: Seconds;
  readonly command: HoldCommand;
}): Outcome => {
  const seat = view({ stored: options.stored, now: options.now });
  switch (seat.status) {
    case "free":
      return granted({ hold: options.command });
    case "held":
      return refused({ reason: "seat-held" });
    case "sold":
      return refused({ reason: "seat-sold" });
  }
};
