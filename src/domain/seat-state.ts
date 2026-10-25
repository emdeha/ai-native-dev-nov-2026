import { z } from "zod";

const wholeSeconds = z.number().int();

export const seatIdSchema = z.string().min(1).brand<"SeatId">();
export const bookerNameSchema = z.string().min(1).brand<"BookerName">();
export const holdRefSchema = z.uuid().brand<"HoldRef">();
export const secondsSchema = wholeSeconds.nonnegative().brand<"Seconds">();
export const advanceSecondsSchema = wholeSeconds.positive().brand<"Seconds">();

export type SeatId = z.infer<typeof seatIdSchema>;
export type BookerName = z.infer<typeof bookerNameSchema>;
export type HoldRef = z.infer<typeof holdRefSchema>;
export type Seconds = z.infer<typeof secondsSchema>;

export const seconds = (value: number): Seconds => secondsSchema.parse(value);

export const holdRef = (value: string): HoldRef => holdRefSchema.parse(value);

export const after = (options: { readonly moment: Seconds; readonly duration: Seconds }): Seconds =>
  seconds(options.moment + options.duration);

export const hasReached = (options: { readonly clock: Seconds; readonly deadline: Seconds }): boolean =>
  options.clock >= options.deadline;

export type Hold = {
  readonly holder: BookerName;
  readonly reference: HoldRef;
  readonly deadline: Seconds;
};

export type SeatState =
  | { readonly status: "free" }
  | { readonly status: "held"; readonly hold: Hold }
  | { readonly status: "sold"; readonly owner: BookerName };

export const free: SeatState = { status: "free" };

export const heldBy = (hold: Hold): SeatState => ({ status: "held", hold });

export const soldTo = (owner: BookerName): SeatState => ({ status: "sold", owner });

export const refusalReasons = [
  "hold-expired",
  "seat-held",
  "seat-sold",
  "no-such-hold",
  "no-such-seat",
  "invalid-request",
] as const;

export type RefusalReason = (typeof refusalReasons)[number];

export type Outcome =
  | {
      readonly tag: "granted";
      readonly reference: HoldRef;
      readonly deadline: Seconds;
      readonly next: SeatState;
    }
  | { readonly tag: "refused"; readonly reason: RefusalReason };

export const granted = (options: { readonly hold: Hold }): Outcome => ({
  tag: "granted",
  reference: options.hold.reference,
  deadline: options.hold.deadline,
  next: heldBy(options.hold),
});

export const refused = (options: { readonly reason: RefusalReason }): Outcome => ({
  tag: "refused",
  reason: options.reason,
});
