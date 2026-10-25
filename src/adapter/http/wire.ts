import { z } from "zod";
import {
  advanceSecondsSchema,
  bookerNameSchema,
  refusalReasons,
  type RefusalReason,
  type SeatState,
  type Seconds,
} from "../../domain/seat-state.ts";
import type { DisplayedSeat } from "../../app/seat-service.ts";

const seatReportSchema = z.object({
  seatId: z.string().min(1),
  status: z.enum(["free", "held", "sold"]),
  holder: z.string().min(1).optional(),
  deadline: z.number().int().optional(),
  owner: z.string().min(1).optional(),
});

const seatingAreaSchema = z.object({ seats: z.array(seatReportSchema) });
const grantedHoldSchema = z.object({ holdRef: z.uuid(), deadline: z.number().int() });
const clockSchema = z.object({ now: z.number().int() });
const refusalSchema = z.object({ reason: z.enum(refusalReasons), message: z.string().min(1) });

export const responseSchemas = {
  seatReport: seatReportSchema,
  seatingArea: seatingAreaSchema,
  grantedHold: grantedHoldSchema,
  clock: clockSchema,
  refusal: refusalSchema,
};

export const holdRequestSchema = z.object({ booker: bookerNameSchema });
export const advanceRequestSchema = z.object({ seconds: advanceSecondsSchema });

export type SeatReportBody = z.infer<typeof seatReportSchema>;
export type SeatingAreaBody = z.infer<typeof seatingAreaSchema>;
export type GrantedHoldBody = z.infer<typeof grantedHoldSchema>;
export type ClockBody = z.infer<typeof clockSchema>;
export type RefusalBody = z.infer<typeof refusalSchema>;
export type OutcomeBody = GrantedHoldBody | RefusalBody;
export type AnswerBody = SeatReportBody | SeatingAreaBody | ClockBody | OutcomeBody;

export type Answer = {
  readonly status: number;
  readonly body: AnswerBody;
};

const statusOfRefusal: Record<RefusalReason, number> = {
  "invalid-request": 400,
  "no-such-seat": 404,
  "no-such-hold": 404,
  "seat-held": 409,
  "seat-sold": 409,
  "hold-expired": 409,
};

const reportOf = (seat: DisplayedSeat): SeatReportBody => {
  const state: SeatState = seat.state;
  switch (state.status) {
    case "free":
      return responseSchemas.seatReport.parse({ seatId: seat.seatId, status: "free" });
    case "held":
      return responseSchemas.seatReport.parse({
        seatId: seat.seatId,
        status: "held",
        holder: state.hold.holder,
        deadline: state.hold.deadline,
      });
    case "sold":
      return responseSchemas.seatReport.parse({
        seatId: seat.seatId,
        status: "sold",
        owner: state.owner,
      });
  }
};

export const seatReportAnswer = (options: { readonly seat: DisplayedSeat }): Answer => ({
  status: 200,
  body: reportOf(options.seat),
});

export const seatingAreaAnswer = (options: { readonly seats: readonly DisplayedSeat[] }): Answer => ({
  status: 200,
  body: responseSchemas.seatingArea.parse({ seats: options.seats.map(reportOf) }),
});

export const grantedHoldAnswer = (options: {
  readonly reference: string;
  readonly deadline: Seconds;
}): Answer => ({
  status: 201,
  body: responseSchemas.grantedHold.parse({ holdRef: options.reference, deadline: options.deadline }),
});

export const clockAnswer = (options: { readonly now: Seconds }): Answer => ({
  status: 200,
  body: responseSchemas.clock.parse({ now: options.now }),
});

export const refusalAnswer = (options: {
  readonly reason: RefusalReason;
  readonly message: string;
}): Answer => ({
  status: statusOfRefusal[options.reason],
  body: responseSchemas.refusal.parse({ reason: options.reason, message: options.message }),
});

export const noSuchSeatAnswer = (options: { readonly seatId: string }): Answer =>
  refusalAnswer({
    reason: "no-such-seat",
    message: `WHAT: the seating area has no seat ${options.seatId}. WHY: the seat inventory is fixed when the service starts and only the seats it names can be held or reported. HOW: ask for one of the seats GET /seats lists.`,
  });

export const failedFields = (failure: {
  readonly issues: ReadonlyArray<{
    readonly path: ReadonlyArray<PropertyKey>;
    readonly message: string;
  }>;
}): string =>
  failure.issues
    .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`)
    .join("; ");

export const invalidRequestAnswer = (options: {
  readonly what: string;
  readonly why: string;
  readonly how: string;
  readonly fields: string;
}): Answer =>
  refusalAnswer({
    reason: "invalid-request",
    message: `WHAT: ${options.what} (${options.fields}). WHY: ${options.why} HOW: ${options.how}`,
  });
