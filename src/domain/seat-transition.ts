import {
  free,
  granted,
  hasReached,
  refused,
  sold,
  type FreeSeat,
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

export type ReleasedHold = { readonly tag: "released"; readonly next: FreeSeat };

export type CommandOutcome = Outcome | ReleasedHold;

const released: ReleasedHold = { tag: "released", next: free };

export type HoldCommand = { readonly tag: "hold"; readonly hold: Hold };

export type ConfirmCommand = { readonly tag: "confirm"; readonly reference: HoldRef };

export type CancelCommand = { readonly tag: "cancel"; readonly reference: HoldRef };

export type Command = HoldCommand | ConfirmCommand | CancelCommand;

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

const outcomeOnTheNamedHold = (options: {
  readonly seat: SeatState;
  readonly stored: SeatState;
  readonly reference: HoldRef;
  readonly whileTheHoldRuns: (hold: Hold) => CommandOutcome;
}): CommandOutcome => {
  switch (options.seat.status) {
    case "held":
      return options.seat.hold.reference === options.reference
        ? options.whileTheHoldRuns(options.seat.hold)
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
}): CommandOutcome => {
  const seat = view({ stored: options.stored, now: options.now });
  const command = options.command;
  switch (command.tag) {
    case "hold":
      return outcomeOfHold({ seat, hold: command.hold });
    case "confirm":
      return outcomeOnTheNamedHold({
        seat,
        stored: options.stored,
        reference: command.reference,
        whileTheHoldRuns: (hold) => sold({ owner: hold.holder }),
      });
    case "cancel":
      return outcomeOnTheNamedHold({
        seat,
        stored: options.stored,
        reference: command.reference,
        whileTheHoldRuns: () => released,
      });
  }
};
