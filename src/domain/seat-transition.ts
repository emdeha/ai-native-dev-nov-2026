import {
  free,
  granted,
  hasReached,
  refused,
  sold,
  type Hold,
  type HoldRef,
  type Outcome,
  type RefusalReason,
  type SeatState,
  type Seconds,
} from "./seat-state.ts";

export const view = (options: { readonly stored: SeatState; readonly now: Seconds }): SeatState =>
  options.stored.status === "held" && hasReached({ clock: options.now, deadline: options.stored.hold.deadline })
    ? free
    : options.stored;

export type HoldCommand = { readonly tag: "hold"; readonly hold: Hold };

export type ConfirmCommand = { readonly tag: "confirm"; readonly reference: HoldRef };

export type Command = HoldCommand | ConfirmCommand;

const outcomeOfHold = (options: { readonly seat: SeatState; readonly hold: Hold }): Outcome => {
  switch (options.seat.status) {
    case "free":
      return granted({ hold: options.hold });
    case "held":
      return refused({ reason: "seat-held" });
    case "sold":
      return refused({ reason: "seat-sold" });
  }
};

const reasonTheHoldIsGone = (options: {
  readonly stored: SeatState;
  readonly reference: HoldRef;
}): RefusalReason =>
  options.stored.status === "held" && options.stored.hold.reference === options.reference
    ? "hold-expired"
    : "no-such-hold";

const outcomeOfConfirm = (options: {
  readonly seat: SeatState;
  readonly stored: SeatState;
  readonly reference: HoldRef;
}): Outcome => {
  switch (options.seat.status) {
    case "held":
      return options.seat.hold.reference === options.reference
        ? sold({ owner: options.seat.hold.holder })
        : refused({ reason: "no-such-hold" });
    case "sold":
      return refused({ reason: "seat-sold" });
    case "free":
      return refused({
        reason: reasonTheHoldIsGone({ stored: options.stored, reference: options.reference }),
      });
  }
};

export const step = (options: {
  readonly stored: SeatState;
  readonly now: Seconds;
  readonly command: Command;
}): Outcome => {
  const seat = view({ stored: options.stored, now: options.now });
  switch (options.command.tag) {
    case "hold":
      return outcomeOfHold({ seat, hold: options.command.hold });
    case "confirm":
      return outcomeOfConfirm({ seat, stored: options.stored, reference: options.command.reference });
  }
};
