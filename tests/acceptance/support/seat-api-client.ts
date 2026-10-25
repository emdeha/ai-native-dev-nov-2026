import { z } from "zod";
import type { SeatingService } from "./start-test-service";

const SeatIdSchema = z.string().min(1).brand<"SeatId">();
const BookerNameSchema = z.string().min(1).brand<"BookerName">();
const OpaqueReferenceSchema = z.uuid();

export type SeatId = z.infer<typeof SeatIdSchema>;
export type BookerName = z.infer<typeof BookerNameSchema>;

export const seatId = (value: string): SeatId => SeatIdSchema.parse(value);
export const bookerName = (value: string): BookerName => BookerNameSchema.parse(value);
export const hasOpaqueReferenceShape = (value: string): boolean =>
  OpaqueReferenceSchema.safeParse(value).success;

const SeatReportSchema = z.object({
  seatId: z.string().min(1),
  status: z.enum(["free", "held", "sold"]),
  holder: z.string().min(1).nullish(),
  deadline: z.number().int().nullish(),
  owner: z.string().min(1).nullish(),
});

const SeatingAreaBodySchema = z.object({ seats: z.array(SeatReportSchema) });
const GrantedHoldBodySchema = z.object({ holdRef: z.string().min(1), deadline: z.number().int() });
const ClockBodySchema = z.object({ now: z.number().int() });
const RefusalBodySchema = z.object({
  reason: z.enum([
    "hold-expired",
    "seat-held",
    "seat-sold",
    "no-such-hold",
    "no-such-seat",
    "invalid-request",
  ]),
  message: z.string().min(1),
});

export type SeatReport = z.infer<typeof SeatReportSchema>;
export type RefusalReason = z.infer<typeof RefusalBodySchema>["reason"];

export type NoAnswer = { readonly tag: "no-answer"; readonly why: string };
export type UnreadableAnswer = {
  readonly tag: "unreadable";
  readonly statusCode: number;
  readonly why: string;
  readonly rawBody: string;
};
export type RefusedCommand = {
  readonly tag: "refused";
  readonly statusCode: number;
  readonly reasonCode: RefusalReason;
  readonly message: string;
  readonly rawBody: string;
};
export type GrantedHold = {
  readonly tag: "granted";
  readonly holdReference: string;
  readonly deadlineSeconds: number;
  readonly rawBody: string;
};
export type ReportedSeat = {
  readonly tag: "reported";
  readonly report: SeatReport;
  readonly rawBody: string;
};
export type ReportedSeatingArea = {
  readonly tag: "reported";
  readonly seats: readonly SeatReport[];
  readonly rawBody: string;
};
export type ReportedTime = {
  readonly tag: "reported";
  readonly nowSeconds: number;
  readonly rawBody: string;
};

export type ConfirmedSale = {
  readonly tag: "confirmed";
  readonly report: SeatReport;
  readonly rawBody: string;
};

export type HoldOutcome = GrantedHold | RefusedCommand | UnreadableAnswer | NoAnswer;
export type ConfirmOutcome = ConfirmedSale | RefusedCommand | UnreadableAnswer | NoAnswer;
export type SeatObservation = ReportedSeat | RefusedCommand | UnreadableAnswer | NoAnswer;
export type SeatingAreaObservation = ReportedSeatingArea | UnreadableAnswer | NoAnswer;
export type ClockObservation = ReportedTime | RefusedCommand | UnreadableAnswer | NoAnswer;

export const summarise = (observation: unknown): string => JSON.stringify(observation);

type Answer = { readonly tag: "answer"; readonly status: number; readonly rawBody: string } | NoAnswer;

const send = async (options: {
  readonly service: SeatingService;
  readonly method: "GET" | "POST";
  readonly route: string;
  readonly body?: unknown;
}): Promise<Answer> => {
  if (options.service.tag === "unavailable") {
    return { tag: "no-answer", why: options.service.why };
  }
  const carriesBody = options.body !== undefined;
  try {
    const response = await fetch(`${options.service.baseUrl}${options.route}`, {
      method: options.method,
      headers: carriesBody ? { "content-type": "application/json" } : undefined,
      body: carriesBody ? JSON.stringify(options.body) : undefined,
    });
    return { tag: "answer", status: response.status, rawBody: await response.text() };
  } catch (error) {
    return {
      tag: "no-answer",
      why: `${options.method} ${options.route} reached no seating service (${String(error)})`,
    };
  }
};

type Reading<T> = { readonly tag: "read"; readonly value: T } | { readonly tag: "unreadable"; readonly why: string };

const read = <T>(schema: z.ZodType<T>, rawBody: string): Reading<T> => {
  const decoded: unknown = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return undefined;
    }
  })();
  if (decoded === undefined) {
    return { tag: "unreadable", why: "the answer is not JSON a browser client could consume" };
  }
  const parsed = schema.safeParse(decoded);
  if (parsed.success) {
    return { tag: "read", value: parsed.data };
  }
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")} ${issue.message}`)
    .join("; ");
  return { tag: "unreadable", why: `the answer does not carry the promised fields (${issues})` };
};

const refusal = (answer: { readonly status: number; readonly rawBody: string }): RefusedCommand | UnreadableAnswer => {
  const body = read(RefusalBodySchema, answer.rawBody);
  return body.tag === "read"
    ? {
        tag: "refused",
        statusCode: answer.status,
        reasonCode: body.value.reason,
        message: body.value.message,
        rawBody: answer.rawBody,
      }
    : { tag: "unreadable", statusCode: answer.status, why: body.why, rawBody: answer.rawBody };
};

const isRefusalStatus = (status: number): boolean => status === 400 || status === 404 || status === 409;

const interpretHold = (answer: Answer): HoldOutcome => {
  if (answer.tag === "no-answer") {
    return answer;
  }
  if (answer.status === 201) {
    const body = read(GrantedHoldBodySchema, answer.rawBody);
    return body.tag === "read"
      ? {
          tag: "granted",
          holdReference: body.value.holdRef,
          deadlineSeconds: body.value.deadline,
          rawBody: answer.rawBody,
        }
      : { tag: "unreadable", statusCode: answer.status, why: body.why, rawBody: answer.rawBody };
  }
  if (isRefusalStatus(answer.status)) {
    return refusal(answer);
  }
  return {
    tag: "unreadable",
    statusCode: answer.status,
    why: `${answer.status} is not a status the seating service promises for a hold`,
    rawBody: answer.rawBody,
  };
};

export const holdSeat = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
}): Promise<HoldOutcome> =>
  interpretHold(
    await send({
      service: options.service,
      method: "POST",
      route: `/seats/${options.seat}/holds`,
      body: { booker: options.booker },
    }),
  );

export const holdSeatWithoutNamingTheBooker = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
}): Promise<HoldOutcome> =>
  interpretHold(
    await send({
      service: options.service,
      method: "POST",
      route: `/seats/${options.seat}/holds`,
      body: {},
    }),
  );

export const confirmHold = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly holdReference: string;
}): Promise<ConfirmOutcome> => {
  const answer = await send({
    service: options.service,
    method: "POST",
    route: `/seats/${options.seat}/holds/${options.holdReference}/confirm`,
  });
  if (answer.tag === "no-answer") {
    return answer;
  }
  if (answer.status === 200) {
    const body = read(SeatReportSchema, answer.rawBody);
    return body.tag === "read"
      ? { tag: "confirmed", report: body.value, rawBody: answer.rawBody }
      : { tag: "unreadable", statusCode: answer.status, why: body.why, rawBody: answer.rawBody };
  }
  if (isRefusalStatus(answer.status)) {
    return refusal(answer);
  }
  return {
    tag: "unreadable",
    statusCode: answer.status,
    why: `${answer.status} is not a status the seating service promises for a confirmation`,
    rawBody: answer.rawBody,
  };
};

export const seatReport = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
}): Promise<SeatObservation> => {
  const answer = await send({ service: options.service, method: "GET", route: `/seats/${options.seat}` });
  if (answer.tag === "no-answer") {
    return answer;
  }
  if (answer.status === 200) {
    const body = read(SeatReportSchema, answer.rawBody);
    return body.tag === "read"
      ? { tag: "reported", report: body.value, rawBody: answer.rawBody }
      : { tag: "unreadable", statusCode: answer.status, why: body.why, rawBody: answer.rawBody };
  }
  if (isRefusalStatus(answer.status)) {
    return refusal(answer);
  }
  return {
    tag: "unreadable",
    statusCode: answer.status,
    why: `${answer.status} is not a status the seating service promises for a seat report`,
    rawBody: answer.rawBody,
  };
};

export const seatingArea = async (options: {
  readonly service: SeatingService;
}): Promise<SeatingAreaObservation> => {
  const answer = await send({ service: options.service, method: "GET", route: "/seats" });
  if (answer.tag === "no-answer") {
    return answer;
  }
  if (answer.status !== 200) {
    return {
      tag: "unreadable",
      statusCode: answer.status,
      why: `${answer.status} is not a status the seating service promises for the seating area`,
      rawBody: answer.rawBody,
    };
  }
  const body = read(SeatingAreaBodySchema, answer.rawBody);
  return body.tag === "read"
    ? { tag: "reported", seats: body.value.seats, rawBody: answer.rawBody }
    : { tag: "unreadable", statusCode: answer.status, why: body.why, rawBody: answer.rawBody };
};

export const advanceClock = async (options: {
  readonly service: SeatingService;
  readonly seconds: number;
}): Promise<ClockObservation> => {
  const answer = await send({
    service: options.service,
    method: "POST",
    route: "/demo/clock/advance",
    body: { seconds: options.seconds },
  });
  if (answer.tag === "no-answer") {
    return answer;
  }
  if (answer.status === 200) {
    const body = read(ClockBodySchema, answer.rawBody);
    return body.tag === "read"
      ? { tag: "reported", nowSeconds: body.value.now, rawBody: answer.rawBody }
      : { tag: "unreadable", statusCode: answer.status, why: body.why, rawBody: answer.rawBody };
  }
  if (isRefusalStatus(answer.status)) {
    return refusal(answer);
  }
  return {
    tag: "unreadable",
    statusCode: answer.status,
    why: `${answer.status} is not a status the seating service promises for the demonstration clock`,
    rawBody: answer.rawBody,
  };
};
