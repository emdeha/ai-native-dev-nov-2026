import { seatIdSchema, type RefusalReason, type SeatId } from "../../domain/seat-state.ts";
import type { SeatService } from "../../app/seat-service.ts";
import {
  advanceRequestSchema,
  clockAnswer,
  failedFields,
  holdPathSchema,
  holdRequestSchema,
  invalidRequestAnswer,
  noSuchSeatAnswer,
  outcomeAnswer,
  refusalAnswer,
  seatReportAnswer,
  seatingAreaAnswer,
  type Answer,
} from "./wire.ts";

export type HttpRequest = {
  readonly method: string;
  readonly path: string;
  readonly body: string;
};

const decoded = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const segmentsOf = (path: string): readonly string[] =>
  path
    .split("?")[0]
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decoded);

const jsonOf = (body: string): unknown => {
  try {
    return JSON.parse(body === "" ? "{}" : body);
  } catch {
    return undefined;
  }
};

export const seatRoutes = (options: { readonly service: SeatService }): ((request: HttpRequest) => Answer) => {
  const { service } = options;

  const refusalForHold = (details: { readonly reason: RefusalReason; readonly seatId: SeatId }): Answer => {
    switch (details.reason) {
      case "no-such-seat":
        return noSuchSeatAnswer({ seatId: details.seatId });
      case "seat-held":
        return refusalAnswer({
          reason: "seat-held",
          message: `WHAT: seat ${details.seatId} is already held by another booker. WHY: one seat is never given to two bookers at the same time. HOW: hold another free seat, or ask again once the hold on this seat has reached its deadline.`,
        });
      case "seat-sold":
        return refusalAnswer({
          reason: "seat-sold",
          message: `WHAT: seat ${details.seatId} is already sold. WHY: a sold seat stays sold to its owner. HOW: hold another free seat.`,
        });
      case "hold-expired":
      case "no-such-hold":
      case "invalid-request":
        return refusalAnswer({
          reason: details.reason,
          message: `WHAT: seat ${details.seatId} cannot be held (${details.reason}). WHY: the seating area refused the hold for the stated reason. HOW: read GET /seats and hold a seat the seating area reports as free.`,
        });
    }
  };

  const refusalForConfirm = (details: { readonly reason: RefusalReason; readonly seatId: SeatId }): Answer => {
    switch (details.reason) {
      case "no-such-seat":
        return noSuchSeatAnswer({ seatId: details.seatId });
      case "hold-expired":
        return refusalAnswer({
          reason: "hold-expired",
          message: `WHAT: the hold on seat ${details.seatId} has reached its deadline. WHY: the deadline is authoritative and there is no grace window, so the seat is free again from the deadline second on. HOW: read GET /seats and hold seat ${details.seatId} again while it is free.`,
        });
      case "no-such-hold":
        return refusalAnswer({
          reason: "no-such-hold",
          message: `WHAT: seat ${details.seatId} has no hold with the reference that was presented. WHY: only the booker the seating area gave the reference to may confirm that hold, and the answer tells nobody whether another hold carries that reference. HOW: present the hold reference the seating area answered when it granted the hold on seat ${details.seatId}.`,
        });
      case "seat-sold":
        return refusalAnswer({
          reason: "seat-sold",
          message: `WHAT: seat ${details.seatId} is already sold. WHY: a sale is final, so a sold seat carries no hold that a confirmation could act on. HOW: hold another free seat.`,
        });
      case "seat-held":
      case "invalid-request":
        return refusalAnswer({
          reason: details.reason,
          message: `WHAT: seat ${details.seatId} cannot be confirmed (${details.reason}). WHY: the seating area refused the confirmation for the stated reason. HOW: read GET /seats/${details.seatId} and confirm only a hold the seating area granted to you.`,
        });
    }
  };

  const seatAnswer = (details: { readonly seatId: SeatId }): Answer => {
    const reading = service.seatOf({ seatId: details.seatId });
    return reading.tag === "seat"
      ? seatReportAnswer({ seat: reading.seat })
      : noSuchSeatAnswer({ seatId: details.seatId });
  };

  const holdAnswer = (details: { readonly seatId: SeatId; readonly body: string }): Answer => {
    const request = holdRequestSchema.safeParse(jsonOf(details.body));
    if (!request.success) {
      return invalidRequestAnswer({
        what: `the hold of seat ${details.seatId} does not carry the booker it is for`,
        why: "a hold belongs to exactly one booker, so the seating area cannot grant one without a name.",
        how: 'send the JSON body {"booker": "<name>"} with the hold.',
        fields: failedFields(request.error),
      });
    }
    return outcomeAnswer({
      seatId: details.seatId,
      outcome: service.hold({ seatId: details.seatId, booker: request.data.booker }),
      refusal: (reason) => refusalForHold({ reason, seatId: details.seatId }),
    });
  };

  const confirmAnswer = (details: { readonly seatId: SeatId; readonly rawHoldRef: string }): Answer => {
    const path = holdPathSchema.safeParse({ holdRef: details.rawHoldRef });
    if (!path.success) {
      return invalidRequestAnswer({
        what: `the confirmation of seat ${details.seatId} does not carry a hold reference the seating area could have issued`,
        why: "a hold reference is an opaque value the seating area alone issues, so a value of another shape can belong to no hold.",
        how: "send the hold reference the seating area answered when it granted the hold, exactly as it was given.",
        fields: failedFields(path.error),
      });
    }
    return outcomeAnswer({
      seatId: details.seatId,
      outcome: service.confirm({ seatId: details.seatId, holdRef: path.data.holdRef }),
      refusal: (reason) => refusalForConfirm({ reason, seatId: details.seatId }),
    });
  };

  const advanceAnswer = (details: { readonly body: string }): Answer => {
    const request = advanceRequestSchema.safeParse(jsonOf(details.body));
    if (!request.success) {
      return invalidRequestAnswer({
        what: "the demonstration clock was asked to move by something other than a positive whole number of seconds",
        why: "the demonstration clock only ever moves forward by whole seconds, and every deadline is judged against the time it reports.",
        how: 'send the JSON body {"seconds": <positive whole number>}.',
        fields: failedFields(request.error),
      });
    }
    return clockAnswer({ now: service.advanceClock({ seconds: request.data.seconds }) });
  };

  const onSeat = (details: {
    readonly rawSeatId: string;
    readonly answer: (seatId: SeatId) => Answer;
  }): Answer => {
    const parsed = seatIdSchema.safeParse(details.rawSeatId);
    return parsed.success ? details.answer(parsed.data) : noSuchSeatAnswer({ seatId: details.rawSeatId });
  };

  const noSuchRoute = (request: HttpRequest): Answer =>
    refusalAnswer({
      reason: "invalid-request",
      message: `WHAT: the seating service offers no ${request.method} ${request.path}. WHY: the service answers only the seat, hold and demonstration routes it promises. HOW: use GET /seats, GET /seats/{seatId}, POST /seats/{seatId}/holds, POST /seats/{seatId}/holds/{holdRef}/confirm or POST /demo/clock/advance.`,
    });

  return (request: HttpRequest): Answer => {
    const segments = segmentsOf(request.path);
    if (request.method === "GET" && segments.length === 1 && segments[0] === "seats") {
      return seatingAreaAnswer({ seats: service.seatingArea() });
    }
    if (request.method === "GET" && segments.length === 2 && segments[0] === "seats") {
      return onSeat({ rawSeatId: segments[1], answer: (seatId) => seatAnswer({ seatId }) });
    }
    if (
      request.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "seats" &&
      segments[2] === "holds"
    ) {
      return onSeat({
        rawSeatId: segments[1],
        answer: (seatId) => holdAnswer({ seatId, body: request.body }),
      });
    }
    if (
      request.method === "POST" &&
      segments.length === 5 &&
      segments[0] === "seats" &&
      segments[2] === "holds" &&
      segments[4] === "confirm"
    ) {
      return onSeat({
        rawSeatId: segments[1],
        answer: (seatId) => confirmAnswer({ seatId, rawHoldRef: segments[3] }),
      });
    }
    if (
      request.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "demo" &&
      segments[1] === "clock" &&
      segments[2] === "advance"
    ) {
      return advanceAnswer({ body: request.body });
    }
    return noSuchRoute(request);
  };
};
