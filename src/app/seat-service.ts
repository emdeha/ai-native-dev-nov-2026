import {
  after,
  refused,
  type BookerName,
  type Outcome,
  type SeatId,
  type SeatState,
  type Seconds,
} from "../domain/seat-state.ts";
import { step, view } from "../domain/seat-transition.ts";
import type { Clock, Configuration, HoldReferences, SeatStore } from "./ports.ts";

export type DisplayedSeat = {
  readonly seatId: SeatId;
  readonly state: SeatState;
};

export type SeatReading =
  | { readonly tag: "seat"; readonly seat: DisplayedSeat }
  | { readonly tag: "no-such-seat" };

export type SeatService = {
  readonly hold: (options: { readonly seatId: SeatId; readonly booker: BookerName }) => Outcome;
  readonly seatOf: (options: { readonly seatId: SeatId }) => SeatReading;
  readonly seatingArea: () => readonly DisplayedSeat[];
  readonly advanceClock: (options: { readonly seconds: Seconds }) => Seconds;
};

export type SeatServiceDependencies = {
  readonly clock: Clock;
  readonly store: SeatStore;
  readonly references: HoldReferences;
  readonly configuration: Configuration;
};

export const seatService = (dependencies: SeatServiceDependencies): SeatService => {
  const { clock, store, references, configuration } = dependencies;

  const seatOf = (options: { readonly seatId: SeatId }): SeatReading => {
    const stored = store.read({ seatId: options.seatId });
    return stored.tag === "no-such-seat"
      ? { tag: "no-such-seat" }
      : {
          tag: "seat",
          seat: { seatId: options.seatId, state: view({ stored: stored.state, now: clock.now() }) },
        };
  };

  const hold = (options: { readonly seatId: SeatId; readonly booker: BookerName }): Outcome => {
    const stored = store.read({ seatId: options.seatId });
    if (stored.tag === "no-such-seat") {
      return refused({ reason: "no-such-seat" });
    }
    const now = clock.now();
    const outcome = step({
      stored: stored.state,
      now,
      command: {
        holder: options.booker,
        reference: references.next(),
        deadline: after({ moment: now, duration: configuration.holdDurationSeconds }),
      },
    });
    if (outcome.tag === "granted") {
      store.write({ seatId: options.seatId, state: outcome.next });
    }
    return outcome;
  };

  const seatingArea = (): readonly DisplayedSeat[] =>
    configuration.inventory.flatMap((seatId) => {
      const reading = seatOf({ seatId });
      return reading.tag === "seat" ? [reading.seat] : [];
    });

  const advanceClock = (options: { readonly seconds: Seconds }): Seconds =>
    clock.advanceBy({ seconds: options.seconds });

  return { hold, seatOf, seatingArea, advanceClock };
};
