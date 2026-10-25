import { randomUUID } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  advanceClock,
  bookerName,
  cancelHold,
  confirmHold,
  holdSeat,
  refusalWhateverTheReason,
  seatId,
  seatReport,
  seatingArea,
  summarise,
  type BookerName,
  type CancelOutcome,
  type ClockObservation,
  type ConfirmOutcome,
  type ConfirmedSale,
  type GrantedHold,
  type HoldOutcome,
  type RefusalReason,
  type RefusedCommand,
  type ReportedSeatingArea,
  type SeatId,
  type SeatReport,
  type SeatingAreaObservation,
} from "./support/seat-api-client";
import { startTestService, type SeatingService } from "./support/start-test-service";

const seatingAreaOfThreeSeats = [seatId("s11"), seatId("s12"), seatId("s13")];
const theContestedSeat = seatId("s12");
const bookers = [bookerName("A"), bookerName("B"), bookerName("C")];
const theFirstBooker = bookers[0];
const theSecondBooker = bookers[1];
const twoMinutes = 120;
const theWalkHoldDuration = 10;

const whatWhyHow = (parts: { readonly what: string; readonly why: string; readonly how: string }): string =>
  `WHAT: ${parts.what}\nWHY: ${parts.why}\nHOW: ${parts.how}`;

const grantedHold = (options: { readonly outcome: HoldOutcome; readonly stimulus: string }): GrantedHold => {
  if (options.outcome.tag === "granted") {
    return options.outcome;
  }
  expect(
    summarise(options.outcome),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.outcome)} instead of a granted hold carrying a hold reference and a deadline.`,
      why: "A seat can only be contested once one booker is holding it, and only the reference handed back by that hold can prove who the holder is.",
      how: 'Answer a hold on a free seat with HTTP 201 and a JSON body {"holdRef": <opaque reference>, "deadline": <whole seconds>}.',
    }),
  ).toBe("a granted hold carrying a hold reference and a deadline");
  return { tag: "granted", holdReference: "", deadlineSeconds: Number.NaN, rawBody: "" };
};

const confirmedSale = (options: { readonly outcome: ConfirmOutcome; readonly stimulus: string }): ConfirmedSale => {
  if (options.outcome.tag === "confirmed") {
    return options.outcome;
  }
  expect(
    summarise(options.outcome),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.outcome)} instead of the seat sold to the booker who was holding it.`,
      why: "The booker who was holding the seat must still be able to buy it, or refusing everybody else would simply mean nobody ever gets the seat.",
      how: 'Answer a confirmation sent by the holder before the deadline with HTTP 200 and the report of that seat as sold: {"seatId": <identifier>, "status": "sold", "owner": <booker name>}.',
    }),
  ).toBe("the seat sold to the booker who was holding it");
  return { tag: "confirmed", report: { seatId: "", status: "free" }, rawBody: "" };
};

const refusedCommand = (options: {
  readonly outcome: CancelOutcome | ConfirmOutcome | HoldOutcome;
  readonly stimulus: string;
  readonly expectedReason: string;
}): RefusedCommand => {
  if (options.outcome.tag === "refused") {
    return options.outcome;
  }
  expect(
    summarise(options.outcome),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.outcome)} instead of a refusal with the reason ${options.expectedReason}.`,
      why: "A request that would give one seat to a second booker must be refused in a way the client can act on, never answered as a success.",
      how: `Answer this request with the refusal status the seating service promises and a JSON body {"reason": "${options.expectedReason}", "message": <human message>}.`,
    }),
  ).toBe(`a refusal with the reason ${options.expectedReason}`);
  return { tag: "refused", statusCode: 0, reasonCode: "invalid-request", message: "", rawBody: "" };
};

const reportedSeatingArea = (options: {
  readonly observation: SeatingAreaObservation;
  readonly stimulus: string;
}): ReportedSeatingArea => {
  if (options.observation.tag === "reported") {
    return options.observation;
  }
  expect(
    summarise(options.observation),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.observation)} instead of the report of the whole seating area.`,
      why: "Whether a seat was sold twice can only be judged from the report of every seat, so a missing or unreadable answer hides the very thing this promise is about.",
      how: 'Answer the seating area with HTTP 200 and a JSON body {"seats": [ <seat report>, ... ]} listing every configured seat in the configured order.',
    }),
  ).toBe("the report of the whole seating area");
  return { tag: "reported", seats: [], rawBody: "" };
};

const reportedTime = (options: { readonly observation: ClockObservation; readonly stimulus: string }): number => {
  if (options.observation.tag === "reported") {
    return options.observation.nowSeconds;
  }
  expect(
    summarise(options.observation),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.observation)} instead of the time the seating service is using.`,
      why: "Every deadline is judged against the time the service itself reports, so a walk through several bookers can only decide what was allowed once it can read that time.",
      how: 'Answer the demonstration clock with HTTP 200 and a JSON body carrying {"now": <whole seconds>} after the clock has moved.',
    }),
  ).toBe("the time the seating service is using");
  return Number.NaN;
};

const givenAFreeSeatingAreaOfThreeSeats = async (options: {
  readonly holdDurationSeconds: number;
}): Promise<SeatingService> =>
  startTestService({
    inventory: seatingAreaOfThreeSeats,
    holdDurationSeconds: options.holdDurationSeconds,
  });

const givenTheClockHasMovedOn = async (options: {
  readonly service: SeatingService;
  readonly seconds: number;
}): Promise<number> =>
  reportedTime({
    observation: await advanceClock({ service: options.service, seconds: options.seconds }),
    stimulus: `moving the demonstration clock on by ${options.seconds} seconds`,
  });

const givenTheBookerHoldsTheSeat = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
}): Promise<GrantedHold> =>
  grantedHold({
    outcome: await holdSeat({ service: options.service, seat: options.seat, booker: options.booker }),
    stimulus: `booker ${options.booker} holding the free seat ${options.seat}`,
  });

const theSeatingAreaNow = async (options: { readonly service: SeatingService }): Promise<ReportedSeatingArea> =>
  reportedSeatingArea({
    observation: await seatingArea({ service: options.service }),
    stimulus: "reading the whole seating area",
  });

const whenTheSecondBookerAsksForTheSeat = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
}): Promise<HoldOutcome> => holdSeat({ service: options.service, seat: options.seat, booker: options.booker });

const whenTheBookerConfirmsWithTheReference = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly holdReference: string;
}): Promise<ConfirmOutcome> =>
  confirmHold({ service: options.service, seat: options.seat, holdReference: options.holdReference });

const thenTheRefusalSays = (options: {
  readonly refused: RefusedCommand;
  readonly stimulus: string;
  readonly expectedStatus: number;
  readonly expectedReason: string;
  readonly why: string;
  readonly how: string;
}): void => {
  expect(
    { statusCode: options.refused.statusCode, reasonCode: options.refused.reasonCode },
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.refused)} instead of ${options.expectedStatus} with the reason "${options.expectedReason}".`,
      why: options.why,
      how: options.how,
    }),
  ).toEqual({ statusCode: options.expectedStatus, reasonCode: options.expectedReason });
};

const thenTheSeatingAreaReadsExactlyAsBefore = (options: {
  readonly before: ReportedSeatingArea;
  readonly after: ReportedSeatingArea;
  readonly stimulus: string;
}): void => {
  expect(
    options.after.rawBody,
    whatWhyHow({
      what: `after ${options.stimulus} the seating area answers ${options.after.rawBody} instead of ${options.before.rawBody}, which is what it answered before.`,
      why: "A refused request must leave the seating area exactly as it was, down to the answer a client reads, so that being refused can never quietly take, sell, release or extend a seat.",
      how: "Decide every refusal before anything is written, and write nothing at all on the refusing path.",
    }),
  ).toBe(options.before.rawBody);
};

const thenTheSeatIsSoldToExactlyOneBooker = (options: {
  readonly seats: readonly SeatReport[];
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly stimulus: string;
}): void => {
  const theSeat = options.seats.filter((report) => report.seatId === String(options.seat));
  expect(
    theSeat.map((report) => ({
      seatId: report.seatId,
      status: report.status,
      owner: report.owner ?? null,
      holder: report.holder ?? null,
      deadline: report.deadline ?? null,
    })),
    whatWhyHow({
      what: `${options.stimulus} the seating area reports ${summarise(theSeat)} for seat ${options.seat} instead of exactly one report of that seat, sold to ${options.booker} with nobody holding it and no deadline on it.`,
      why: "One seat is never sold twice: the seating area must name one owner for the seat and nobody else, and must carry no deadline that could ever release it again.",
      how: 'Report a sold seat once, with its identifier, the status "sold" and the owner name only, and write no holder, no deadline and no hold reference on it.',
    }),
  ).toEqual([
    {
      seatId: String(options.seat),
      status: "sold",
      owner: String(options.booker),
      holder: null,
      deadline: null,
    },
  ]);
};

const thenTheSaleCannotBeTakenOrRepeated = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly owner: BookerName;
  readonly otherBooker: BookerName;
  readonly ownersReference: string;
  readonly rightAfterTheSale: ReportedSeatingArea;
}): Promise<void> => {
  const secondAttempt = `booker ${options.otherBooker} asking a second time for seat ${options.seat}, which ${options.owner} has just bought`;
  thenTheRefusalSays({
    refused: refusedCommand({
      outcome: await whenTheSecondBookerAsksForTheSeat({
        service: options.service,
        seat: options.seat,
        booker: options.otherBooker,
      }),
      stimulus: secondAttempt,
      expectedReason: "seat-sold",
    }),
    stimulus: secondAttempt,
    expectedStatus: 409,
    expectedReason: "seat-sold",
    why: "A booker who keeps asking for a seat somebody has already bought must learn that it is gone for good, instead of being given a seat that already belongs to somebody else.",
    how: 'Refuse a hold on a sold seat with HTTP 409 and the reason code "seat-sold".',
  });

  const repeatedConfirmation = `booker ${options.owner} sending their own hold reference for seat ${options.seat} again, after that reference has already bought the seat`;
  thenTheRefusalSays({
    refused: refusedCommand({
      outcome: await whenTheBookerConfirmsWithTheReference({
        service: options.service,
        seat: options.seat,
        holdReference: options.ownersReference,
      }),
      stimulus: repeatedConfirmation,
      expectedReason: "seat-sold",
    }),
    stimulus: repeatedConfirmation,
    expectedStatus: 409,
    expectedReason: "seat-sold",
    why: "A hold reference buys its seat once and is spent afterwards, and the answer must say that the seat is sold rather than pretend the reference was never known.",
    how: 'Refuse a confirmation presenting the spent reference of a sold seat with HTTP 409 and the reason code "seat-sold", never with "no-such-hold".',
  });

  thenTheSeatingAreaReadsExactlyAsBefore({
    before: options.rightAfterTheSale,
    after: await theSeatingAreaNow({ service: options.service }),
    stimulus: "a second booker and a spent hold reference both being refused the sold seat",
  });
};

type ReferenceChoice =
  | "the reference of the hold on this seat"
  | "the reference of a hold on another seat"
  | "a reference nobody was ever given";

type WalkCommand =
  | { readonly kind: "hold"; readonly seat: SeatId; readonly booker: BookerName }
  | { readonly kind: "confirm"; readonly seat: SeatId; readonly reference: ReferenceChoice }
  | { readonly kind: "cancel"; readonly seat: SeatId; readonly reference: ReferenceChoice }
  | { readonly kind: "the clock moves on"; readonly seconds: number };

type SeatRecord =
  | { readonly tag: "nothing is stored" }
  | { readonly tag: "a hold"; readonly booker: BookerName; readonly reference: string; readonly deadline: number }
  | { readonly tag: "a sale"; readonly owner: BookerName };

type Expectation =
  | { readonly tag: "a granted hold"; readonly deadline: number }
  | { readonly tag: "the seat sold"; readonly booker: BookerName }
  | { readonly tag: "the seat given up" }
  | { readonly tag: "a refusal"; readonly statusCode: number; readonly reasonCode: RefusalReason }
  | { readonly tag: "a refusal the promise does not name" };

type Answer = { readonly kind: string; readonly statusCode: number; readonly detail: string };

type WalkState = {
  readonly records: Readonly<Record<string, SeatRecord>>;
  readonly now: number;
  readonly ownersSeen: Readonly<Record<string, readonly string[]>>;
};

const noSeatHasAnything: Readonly<Record<string, SeatRecord>> = Object.fromEntries(
  seatingAreaOfThreeSeats.map((seat) => [String(seat), { tag: "nothing is stored" } as const]),
);

const noOwnersSeen: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  seatingAreaOfThreeSeats.map((seat) => [String(seat), []]),
);

const recordOf = (state: WalkState, seat: SeatId): SeatRecord =>
  state.records[String(seat)] ?? { tag: "nothing is stored" };

const reportFromTheRules = (options: { readonly seat: SeatId; readonly record: SeatRecord; readonly now: number }) => {
  if (options.record.tag === "a sale") {
    return {
      seatId: String(options.seat),
      status: "sold",
      owner: String(options.record.owner),
      holder: null,
      deadline: null,
    };
  }
  if (options.record.tag === "a hold" && options.now < options.record.deadline) {
    return {
      seatId: String(options.seat),
      status: "held",
      owner: null,
      holder: String(options.record.booker),
      deadline: options.record.deadline,
    };
  }
  return { seatId: String(options.seat), status: "free", owner: null, holder: null, deadline: null };
};

const theSeatingAreaTheRulesPromise = (state: WalkState) =>
  seatingAreaOfThreeSeats.map((seat) =>
    reportFromTheRules({ seat, record: recordOf(state, seat), now: state.now }),
  );

const asComparableReports = (seats: readonly SeatReport[]) =>
  seats.map((report) => ({
    seatId: report.seatId,
    status: report.status,
    owner: report.owner ?? null,
    holder: report.holder ?? null,
    deadline: report.deadline ?? null,
  }));

const theSeatReportNow = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
}): Promise<SeatReport> => {
  const observation = await seatReport({ service: options.service, seat: options.seat });
  if (observation.tag === "reported") {
    return observation.report;
  }
  expect(
    summarise(observation),
    whatWhyHow({
      what: `reading seat ${options.seat} on its own answered ${summarise(observation)} instead of the report of that seat.`,
      why: "A booker who has just been refused reads the one seat they asked for, so that report must stay readable for the refusal to be shown to have changed nothing.",
      how: 'Answer a read of one configured seat with HTTP 200 and the report of that seat as JSON: {"seatId": <identifier>, "status": "free" | "held" | "sold", ...}.',
    }),
  ).toBe("the report of that seat");
  return { seatId: String(options.seat), status: "free" };
};

const thenTheSeatReportIsTheOneTheRulesPromise = (options: {
  readonly report: SeatReport;
  readonly seat: SeatId;
  readonly record: SeatRecord;
  readonly now: number;
  readonly stimulus: string;
}): void => {
  const promised = reportFromTheRules({ seat: options.seat, record: options.record, now: options.now });
  expect(
    asComparableReports([options.report]),
    whatWhyHow({
      what: `after ${options.stimulus} the report of seat ${options.seat} reads ${summarise(options.report)} instead of ${summarise(promised)}, which is what it read before.`,
      why: "A refusal whose reason the seating service never promised must still leave the seat exactly as it was, and the seat read on its own route is where a booker sees that directly.",
      how: "Decide the refusal before anything is written, and write nothing at all on the refusing path.",
    }),
  ).toEqual([promised]);
};

const expectationForAHold = (options: {
  readonly record: SeatRecord;
  readonly now: number;
  readonly holdDurationSeconds: number;
}): Expectation => {
  if (options.record.tag === "a sale") {
    return { tag: "a refusal", statusCode: 409, reasonCode: "seat-sold" };
  }
  if (options.record.tag === "a hold" && options.now < options.record.deadline) {
    return { tag: "a refusal", statusCode: 409, reasonCode: "seat-held" };
  }
  return { tag: "a granted hold", deadline: options.now + options.holdDurationSeconds };
};

const expectationForAHoldCommand = (options: {
  readonly record: SeatRecord;
  readonly now: number;
  readonly reference: string;
  readonly success: Expectation;
  readonly saleIsNamed: boolean;
}): Expectation => {
  if (options.record.tag === "a sale") {
    return options.saleIsNamed
      ? { tag: "a refusal", statusCode: 409, reasonCode: "seat-sold" }
      : { tag: "a refusal the promise does not name" };
  }
  if (options.record.tag === "nothing is stored" || options.record.reference !== options.reference) {
    return { tag: "a refusal", statusCode: 404, reasonCode: "no-such-hold" };
  }
  if (options.now >= options.record.deadline) {
    return { tag: "a refusal", statusCode: 409, reasonCode: "hold-expired" };
  }
  return options.success;
};

const describeTheAnswer = (outcome: CancelOutcome | ConfirmOutcome | HoldOutcome): Answer => {
  switch (outcome.tag) {
    case "granted":
      return { kind: "a granted hold", statusCode: 201, detail: `deadline ${outcome.deadlineSeconds}` };
    case "confirmed":
      return { kind: "the seat sold", statusCode: 200, detail: `owner ${outcome.report.owner ?? "nobody"}` };
    case "released":
      return { kind: "the seat given up", statusCode: 200, detail: `status ${outcome.report.status}` };
    case "refused":
      return { kind: "a refusal", statusCode: outcome.statusCode, detail: outcome.reasonCode };
    case "unreadable":
      return { kind: "an answer no client can read", statusCode: outcome.statusCode, detail: outcome.why };
    case "no-answer":
      return { kind: "no answer at all", statusCode: 0, detail: outcome.why };
  }
};

const describeWhatTheRulesPromise = (expectation: Expectation): Answer => {
  switch (expectation.tag) {
    case "a granted hold":
      return { kind: "a granted hold", statusCode: 201, detail: `deadline ${expectation.deadline}` };
    case "the seat sold":
      return { kind: "the seat sold", statusCode: 200, detail: `owner ${expectation.booker}` };
    case "the seat given up":
      return { kind: "the seat given up", statusCode: 200, detail: "status free" };
    case "a refusal":
      return { kind: "a refusal", statusCode: expectation.statusCode, detail: expectation.reasonCode };
    case "a refusal the promise does not name":
      return { kind: "a refusal", statusCode: 0, detail: "" };
  }
};

const isARefusal = (expectation: Expectation): boolean =>
  expectation.tag === "a refusal" || expectation.tag === "a refusal the promise does not name";

const nextRecord = (options: {
  readonly record: SeatRecord;
  readonly command: WalkCommand;
  readonly expectation: Expectation;
  readonly grantedReference: string;
}): SeatRecord => {
  if (options.expectation.tag === "a granted hold" && options.command.kind === "hold") {
    return {
      tag: "a hold",
      booker: options.command.booker,
      reference: options.grantedReference,
      deadline: options.expectation.deadline,
    };
  }
  if (options.expectation.tag === "the seat sold") {
    return { tag: "a sale", owner: options.expectation.booker };
  }
  if (options.expectation.tag === "the seat given up") {
    return { tag: "nothing is stored" };
  }
  return options.record;
};

const referenceToSend = (options: {
  readonly state: WalkState;
  readonly seat: SeatId;
  readonly choice: ReferenceChoice;
  readonly neverGranted: string;
}): string => {
  if (options.choice === "a reference nobody was ever given") {
    return options.neverGranted;
  }
  const own = recordOf(options.state, options.seat);
  if (options.choice === "the reference of the hold on this seat") {
    return own.tag === "a hold" ? own.reference : options.neverGranted;
  }
  const elsewhere = seatingAreaOfThreeSeats
    .filter((other) => String(other) !== String(options.seat))
    .map((other) => recordOf(options.state, other))
    .filter((record) => record.tag === "a hold");
  const borrowed = elsewhere[0];
  return borrowed !== undefined && borrowed.tag === "a hold" ? borrowed.reference : options.neverGranted;
};

const sendOneCommand = async (options: {
  readonly service: SeatingService;
  readonly command: WalkCommand;
  readonly reference: string;
}): Promise<CancelOutcome | ConfirmOutcome | HoldOutcome> => {
  if (options.command.kind === "hold") {
    return holdSeat({ service: options.service, seat: options.command.seat, booker: options.command.booker });
  }
  if (options.command.kind === "confirm") {
    return confirmHold({
      service: options.service,
      seat: options.command.seat,
      holdReference: options.reference,
    });
  }
  if (options.command.kind === "cancel") {
    return cancelHold({ service: options.service, seat: options.command.seat, holdReference: options.reference });
  }
  return { tag: "no-answer", why: "the clock does not answer as a seat command" };
};

const thenTheAnswerIsTheOneThePromiseGives = (options: {
  readonly outcome: CancelOutcome | ConfirmOutcome | HoldOutcome;
  readonly expectation: Expectation;
  readonly stimulus: string;
}): void => {
  const answered = describeTheAnswer(options.outcome);
  if (options.expectation.tag === "a refusal the promise does not name") {
    const reading = refusalWhateverTheReason(options.outcome);
    expect(
      reading.tag === "refused-for-any-reason" ? "a refusal" : reading.why,
      whatWhyHow({
        what: `${options.stimulus} answered ${summarise(answered)} instead of a refusal of any kind.`,
        why: "A seat that has been bought belongs to its owner for good, so no later request may be answered as a success and quietly take it away again. The seating service never promised which reason it gives for this refusal, so any machine reason code is accepted here and only the refusal itself is judged.",
        how: "Refuse every command that names a seat which has already been sold, with any refusal status and any machine reason code the service chooses, and leave the seat and the seating area exactly as they were.",
      }),
    ).toBe("a refusal");
    return;
  }
  const promised = describeWhatTheRulesPromise(options.expectation);
  expect(
    answered,
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(answered)} instead of ${summarise(promised)}.`,
      why: "Whoever acts first owns the outcome: with the seats and the time known, exactly one answer keeps the seat with one booker, and any other answer either gives it to a second booker or takes it from the booker who earned it.",
      how: "Decide every hold, confirmation and cancellation from the seat as it reads at the time of the request, comparing the deadline with the clock and the presented reference with the reference the hold was granted with.",
    }),
  ).toEqual(promised);
};

const thenTheSeatingAreaIsTheOneTheRulesPromise = (options: {
  readonly seats: readonly SeatReport[];
  readonly state: WalkState;
  readonly stimulus: string;
}): void => {
  expect(
    asComparableReports(options.seats),
    whatWhyHow({
      what: `after ${options.stimulus} the seating area reads ${summarise(options.seats)} instead of ${summarise(theSeatingAreaTheRulesPromise(options.state))}.`,
      why: "The seating area is the only place a booker can see who holds and who owns each seat, so every configured seat must be reported once, in the configured order, and must name the booker the commands so far gave it to.",
      how: "Report every configured seat from the one projection that compares the hold deadline with the clock, and change a seat only on a command that the rules grant.",
    }),
  ).toEqual(theSeatingAreaTheRulesPromise(options.state));
};

const ownersAfter = (options: {
  readonly seen: Readonly<Record<string, readonly string[]>>;
  readonly seats: readonly SeatReport[];
}): Readonly<Record<string, readonly string[]>> =>
  Object.fromEntries(
    seatingAreaOfThreeSeats.map((seat) => {
      const already = options.seen[String(seat)] ?? [];
      const sold = options.seats.filter(
        (report) => report.seatId === String(seat) && report.status === "sold" && report.owner !== null,
      );
      const names = sold.map((report) => report.owner ?? "");
      return [String(seat), [...already, ...names.filter((name) => !already.includes(name))]];
    }),
  );

const walkOneCommandAtATime = async (options: {
  readonly service: SeatingService;
  readonly commands: readonly WalkCommand[];
  readonly holdDurationSeconds: number;
  readonly state: WalkState;
  readonly step: number;
}): Promise<WalkState> => {
  const [command, ...rest] = options.commands;
  if (command === undefined) {
    return options.state;
  }
  const before = await theSeatingAreaNow({ service: options.service });
  thenTheSeatingAreaIsTheOneTheRulesPromise({
    seats: before.seats,
    state: options.state,
    stimulus: `the first ${options.step} commands of the walk`,
  });

  if (command.kind === "the clock moves on") {
    const stimulus = `moving the demonstration clock on by ${command.seconds} seconds as command ${options.step + 1} of the walk`;
    const reported = await givenTheClockHasMovedOn({ service: options.service, seconds: command.seconds });
    expect(
      reported,
      whatWhyHow({
        what: `${stimulus} left the service reporting ${reported} instead of ${options.state.now + command.seconds}.`,
        why: "Every deadline is judged against the time the service reports, so the time may move only by the seconds the demonstration asked for and never by itself.",
        how: "Move the clock only in the demonstration advance operation, and only by the seconds it was given.",
      }),
    ).toBe(options.state.now + command.seconds);
    const movedOn: WalkState = { ...options.state, now: options.state.now + command.seconds };
    const after = await theSeatingAreaNow({ service: options.service });
    thenTheSeatingAreaIsTheOneTheRulesPromise({ seats: after.seats, state: movedOn, stimulus: stimulus });
    return walkOneCommandAtATime({
      ...options,
      commands: rest,
      step: options.step + 1,
      state: { ...movedOn, ownersSeen: ownersAfter({ seen: movedOn.ownersSeen, seats: after.seats }) },
    });
  }

  const record = recordOf(options.state, command.seat);
  const reference =
    command.kind === "hold"
      ? ""
      : referenceToSend({
          state: options.state,
          seat: command.seat,
          choice: command.reference,
          neverGranted: randomUUID(),
        });
  const expectation =
    command.kind === "hold"
      ? expectationForAHold({
          record,
          now: options.state.now,
          holdDurationSeconds: options.holdDurationSeconds,
        })
      : expectationForAHoldCommand({
          record,
          now: options.state.now,
          reference,
          saleIsNamed: command.kind === "confirm",
          success:
            command.kind === "confirm"
              ? { tag: "the seat sold", booker: record.tag === "a hold" ? record.booker : theFirstBooker }
              : { tag: "the seat given up" },
        });

  const stimulus =
    command.kind === "hold"
      ? `booker ${command.booker} asking for seat ${command.seat} as command ${options.step + 1} of the walk`
      : `a ${command.kind === "confirm" ? "confirmation" : "cancellation"} of seat ${command.seat} carrying ${command.reference}, as command ${options.step + 1} of the walk`;

  const outcome = await sendOneCommand({ service: options.service, command, reference });
  thenTheAnswerIsTheOneThePromiseGives({ outcome, expectation, stimulus });

  const after = await theSeatingAreaNow({ service: options.service });
  if (isARefusal(expectation)) {
    thenTheSeatingAreaReadsExactlyAsBefore({ before, after, stimulus });
  }
  if (expectation.tag === "a refusal the promise does not name") {
    thenTheSeatReportIsTheOneTheRulesPromise({
      report: await theSeatReportNow({ service: options.service, seat: command.seat }),
      seat: command.seat,
      record,
      now: options.state.now,
      stimulus,
    });
  }
  const movedOn: WalkState = {
    ...options.state,
    records: {
      ...options.state.records,
      [String(command.seat)]: nextRecord({
        record,
        command,
        expectation,
        grantedReference: outcome.tag === "granted" ? outcome.holdReference : "",
      }),
    },
  };
  thenTheSeatingAreaIsTheOneTheRulesPromise({ seats: after.seats, state: movedOn, stimulus });
  return walkOneCommandAtATime({
    ...options,
    commands: rest,
    step: options.step + 1,
    state: { ...movedOn, ownersSeen: ownersAfter({ seen: movedOn.ownersSeen, seats: after.seats }) },
  });
};

const thenNoSeatWasEverSoldToTwoBookers = (options: {
  readonly state: WalkState;
  readonly commands: readonly WalkCommand[];
}): void => {
  const soldToMoreThanOne = seatingAreaOfThreeSeats
    .map((seat) => ({ seat: String(seat), owners: options.state.ownersSeen[String(seat)] ?? [] }))
    .filter((seen) => seen.owners.length > 1);
  expect(
    soldToMoreThanOne,
    whatWhyHow({
      what: `the walk ${summarise(options.commands)} ended with ${summarise(soldToMoreThanOne)}: a seat of the three configured seats was reported sold to more than one booker during the walk.`,
      why: "This is the whole promise of the seating service: whatever order bookers ask, confirm, give up and wait in, a seat that has been bought belongs to one booker and to nobody else, because two bookers arriving at one seat is the harm nobody can repair afterwards.",
      how: "Refuse every hold and every confirmation on a seat that is already sold, and grant a hold only when the seat reads free at the moment of the request.",
    }),
  ).toEqual([]);
};

const aSeatOfTheArea = fc.constantFrom(...seatingAreaOfThreeSeats);
const aBooker = fc.constantFrom(...bookers);
const aReferenceChoice = fc.constantFrom<ReferenceChoice>(
  "the reference of the hold on this seat",
  "the reference of a hold on another seat",
  "a reference nobody was ever given",
);
const aWalkCommand = fc.oneof(
  { arbitrary: fc.record({ kind: fc.constant("hold" as const), seat: aSeatOfTheArea, booker: aBooker }), weight: 4 },
  {
    arbitrary: fc.record({ kind: fc.constant("confirm" as const), seat: aSeatOfTheArea, reference: aReferenceChoice }),
    weight: 3,
  },
  {
    arbitrary: fc.record({ kind: fc.constant("cancel" as const), seat: aSeatOfTheArea, reference: aReferenceChoice }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant("the clock moves on" as const),
      seconds: fc.oneof(
        { arbitrary: fc.integer({ min: 1, max: 3 }), weight: 3 },
        { arbitrary: fc.integer({ min: 1, max: 300 }), weight: 1 },
      ),
    }),
    weight: 2,
  },
);

const holdOf = (seat: SeatId, booker: BookerName): WalkCommand => ({ kind: "hold", seat, booker });
const confirmOf = (seat: SeatId, reference: ReferenceChoice): WalkCommand => ({ kind: "confirm", seat, reference });
const cancelOf = (seat: SeatId, reference: ReferenceChoice): WalkCommand => ({ kind: "cancel", seat, reference });
const clockMovesOn = (seconds: number): WalkCommand => ({ kind: "the clock moves on", seconds });

const twoBookersRaceForTheSameSeat: readonly WalkCommand[] = [
  holdOf(theContestedSeat, theFirstBooker),
  holdOf(theContestedSeat, theSecondBooker),
  confirmOf(theContestedSeat, "the reference of the hold on this seat"),
  holdOf(theContestedSeat, theSecondBooker),
  confirmOf(theContestedSeat, "the reference of the hold on this seat"),
];

const aStrangerTriesReferencesThatAreNotTheirs: readonly WalkCommand[] = [
  holdOf(theContestedSeat, theFirstBooker),
  holdOf(seatingAreaOfThreeSeats[0], theSecondBooker),
  confirmOf(theContestedSeat, "the reference of a hold on another seat"),
  cancelOf(theContestedSeat, "the reference of a hold on another seat"),
  cancelOf(theContestedSeat, "a reference nobody was ever given"),
  confirmOf(theContestedSeat, "the reference of the hold on this seat"),
];

const aConfirmationLandsOneSecondBeforeTheDeadline: readonly WalkCommand[] = [
  holdOf(theContestedSeat, theFirstBooker),
  clockMovesOn(theWalkHoldDuration - 1),
  confirmOf(theContestedSeat, "the reference of the hold on this seat"),
];

const aConfirmationLandsOnTheDeadlineSecond: readonly WalkCommand[] = [
  holdOf(theContestedSeat, theFirstBooker),
  clockMovesOn(theWalkHoldDuration),
  confirmOf(theContestedSeat, "the reference of the hold on this seat"),
  holdOf(theContestedSeat, theSecondBooker),
  confirmOf(theContestedSeat, "the reference of the hold on this seat"),
];

const theClockJumpsFarPastSeveralHoldDurations: readonly WalkCommand[] = [
  holdOf(theContestedSeat, theFirstBooker),
  holdOf(seatingAreaOfThreeSeats[2], theSecondBooker),
  clockMovesOn(300),
  holdOf(theContestedSeat, theSecondBooker),
  confirmOf(theContestedSeat, "the reference of the hold on this seat"),
  cancelOf(seatingAreaOfThreeSeats[2], "the reference of the hold on this seat"),
];

const aHolderGivesTheSeatUpAndTheNextBookerTakesIt: readonly WalkCommand[] = [
  holdOf(theContestedSeat, theFirstBooker),
  cancelOf(theContestedSeat, "the reference of the hold on this seat"),
  holdOf(theContestedSeat, theSecondBooker),
  confirmOf(theContestedSeat, "the reference of the hold on this seat"),
  cancelOf(theContestedSeat, "the reference of the hold on this seat"),
];

describe("One seat is never sold twice", () => {
  it("the booker who holds the seat buys it while a second booker and a stranger are refused at every turn", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({
        service,
        seat: theContestedSeat,
        booker: theFirstBooker,
      });
      const beforeTheRefusals = await theSeatingAreaNow({ service });
      const secondBookerAsks = `booker ${theSecondBooker} asking for seat ${theContestedSeat}, which ${theFirstBooker} is holding`;
      thenTheRefusalSays({
        refused: refusedCommand({
          outcome: await whenTheSecondBookerAsksForTheSeat({
            service,
            seat: theContestedSeat,
            booker: theSecondBooker,
          }),
          stimulus: secondBookerAsks,
          expectedReason: "seat-held",
        }),
        stimulus: secondBookerAsks,
        expectedStatus: 409,
        expectedReason: "seat-held",
        why: "One seat is never given to two bookers, and the second booker must learn that somebody is already holding it.",
        how: 'Refuse a hold on a held seat with HTTP 409 and the reason code "seat-held".',
      });
      const strangerConfirms = `a stranger confirming seat ${theContestedSeat} with a reference the seating service never granted`;
      thenTheRefusalSays({
        refused: refusedCommand({
          outcome: await whenTheBookerConfirmsWithTheReference({
            service,
            seat: theContestedSeat,
            holdReference: randomUUID(),
          }),
          stimulus: strangerConfirms,
          expectedReason: "no-such-hold",
        }),
        stimulus: strangerConfirms,
        expectedStatus: 404,
        expectedReason: "no-such-hold",
        why: "Only the booker who was given the reference of that hold may buy the seat, so a stranger who guesses a reference must take nothing away from the holder.",
        how: 'Refuse a confirmation whose reference is not the reference of the hold on that seat with HTTP 404 and the reason code "no-such-hold".',
      });
      thenTheSeatingAreaReadsExactlyAsBefore({
        before: beforeTheRefusals,
        after: await theSeatingAreaNow({ service }),
        stimulus: "a second booker and a stranger both being refused the held seat",
      });

      const sale = confirmedSale({
        outcome: await whenTheBookerConfirmsWithTheReference({
          service,
          seat: theContestedSeat,
          holdReference: granted.holdReference,
        }),
        stimulus: `booker ${theFirstBooker} confirming seat ${theContestedSeat} with their own hold reference, before the deadline ${granted.deadlineSeconds}`,
      });

      expect(
        sale.report.owner ?? null,
        whatWhyHow({
          what: `the answer to the confirmation reports ${summarise(sale.report)} instead of seat ${theContestedSeat} sold to ${theFirstBooker}.`,
          why: "The booker who held the seat and confirmed it in time is the one booker the seat belongs to, and they learn that from the answer to their own confirmation.",
          how: 'Answer the holder\'s confirmation with the report of that seat as sold to them: {"seatId": <identifier>, "status": "sold", "owner": <holder name>}.',
        }),
      ).toBe(String(theFirstBooker));
      const rightAfterTheSale = await theSeatingAreaNow({ service });
      thenTheSeatIsSoldToExactlyOneBooker({
        seats: rightAfterTheSale.seats,
        seat: theContestedSeat,
        booker: theFirstBooker,
        stimulus: "right after the sale",
      });
      await thenTheSaleCannotBeTakenOrRepeated({
        service,
        seat: theContestedSeat,
        owner: theFirstBooker,
        otherBooker: theSecondBooker,
        ownersReference: granted.holdReference,
        rightAfterTheSale,
      });
    } finally {
      await service.stop();
    }
  });

  it("a stranger cannot tell a reference nobody was given from the reference of somebody else's hold [law-wire-shape]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      await givenTheBookerHoldsTheSeat({ service, seat: theContestedSeat, booker: theFirstBooker });
      const heldElsewhere = await givenTheBookerHoldsTheSeat({
        service,
        seat: seatingAreaOfThreeSeats[0],
        booker: theSecondBooker,
      });

      const toAReferenceNobodyWasGiven = refusedCommand({
        outcome: await whenTheBookerConfirmsWithTheReference({
          service,
          seat: theContestedSeat,
          holdReference: randomUUID(),
        }),
        stimulus: `confirming seat ${theContestedSeat} with a reference nobody was ever given`,
        expectedReason: "no-such-hold",
      });
      const toAnotherBookersReference = refusedCommand({
        outcome: await whenTheBookerConfirmsWithTheReference({
          service,
          seat: theContestedSeat,
          holdReference: heldElsewhere.holdReference,
        }),
        stimulus: `confirming seat ${theContestedSeat} with the reference of ${theSecondBooker}'s hold on another seat`,
        expectedReason: "no-such-hold",
      });

      expect(
        { statusCode: toAnotherBookersReference.statusCode, body: toAnotherBookersReference.rawBody },
        whatWhyHow({
          what: `confirming seat ${theContestedSeat} with another booker's live reference answered ${summarise(toAnotherBookersReference)} while a reference nobody was ever given answered ${summarise(toAReferenceNobodyWasGiven)}, so the two can be told apart.`,
          why: "If a refusal reveals that a reference exists somewhere, a stranger can search for a live hold reference and then take the seat from the booker who holds it.",
          how: "Answer both refusals identically, with HTTP 404, the reason code \"no-such-hold\" and the same message, carrying no detail about the reference that was presented.",
        }),
      ).toEqual({
        statusCode: toAReferenceNobodyWasGiven.statusCode,
        body: toAReferenceNobodyWasGiven.rawBody,
      });
    } finally {
      await service.stop();
    }
  });

  it("whatever order bookers ask, buy, give up and wait, no seat is ever sold to two bookers [cc-one-holder] [law-hold-only-on-free] [law-only-the-holder-acts] [law-sold-is-absorbing] [law-refusal-is-inert]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(aWalkCommand, { minLength: 3, maxLength: 8 }), async (commands) => {
        const service = await givenAFreeSeatingAreaOfThreeSeats({
          holdDurationSeconds: theWalkHoldDuration,
        });
        try {
          const now = await givenTheClockHasMovedOn({ service, seconds: 1 });

          const ended = await walkOneCommandAtATime({
            service,
            commands,
            holdDurationSeconds: theWalkHoldDuration,
            state: { records: noSeatHasAnything, now, ownersSeen: noOwnersSeen },
            step: 0,
          });

          thenNoSeatWasEverSoldToTwoBookers({ state: ended, commands });
        } finally {
          await service.stop();
        }
      }),
      {
        numRuns: 6,
        examples: [
          [twoBookersRaceForTheSameSeat],
          [aStrangerTriesReferencesThatAreNotTheirs],
          [aConfirmationLandsOneSecondBeforeTheDeadline],
          [aConfirmationLandsOnTheDeadlineSecond],
          [theClockJumpsFarPastSeveralHoldDurations],
          [aHolderGivesTheSeatUpAndTheNextBookerTakesIt],
        ],
      },
    );
  });
});
