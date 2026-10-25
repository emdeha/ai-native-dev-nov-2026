import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  advanceClock,
  advanceClockWithBody,
  bookerName,
  fieldsOfTheAnswer,
  hasOpaqueReferenceShape,
  holdSeat,
  holdSeatWithoutNamingTheBooker,
  seatId,
  seatReport,
  seatingArea,
  summarise,
  type AnyObservation,
  type BookerName,
  type ClockObservation,
  type GrantedHold,
  type HoldOutcome,
  type RefusedCommand,
  type ReportedSeat,
  type ReportedSeatingArea,
  type ReportedTime,
  type SeatId,
  type SeatObservation,
  type SeatReport,
  type SeatingAreaObservation,
} from "./support/seat-api-client";
import { startTestService, type SeatingService } from "./support/start-test-service";

const seatingAreaOfThreeSeats = [seatId("s11"), seatId("s12"), seatId("s13")];
const theChosenSeat = seatId("s12");
const aSeatThatWasNeverConfigured = seatId("s99");
const bookers = [bookerName("A"), bookerName("B"), bookerName("C")];
const bookerPairs = [
  { first: bookers[0], second: bookers[1] },
  { first: bookers[1], second: bookers[2] },
  { first: bookers[2], second: bookers[0] },
  { first: bookers[0], second: bookers[2] },
];
const twoMinutes = 120;

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
      why: "A booker who holds a free seat must receive the reference that makes the hold theirs and the deadline until which the seat is kept.",
      how: 'Answer a hold on a free seat with HTTP 201 and a JSON body {"holdRef": <opaque reference>, "deadline": <whole seconds>}.',
    }),
  ).toBe("a granted hold carrying a hold reference and a deadline");
  return { tag: "granted", holdReference: "", deadlineSeconds: Number.NaN, rawBody: "" };
};

const refusedCommand = (options: {
  readonly outcome: AnyObservation;
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
      why: "A request the seating area cannot grant must be refused in a way a client can act on, never answered as a success and never answered as prose.",
      how: `Answer this request with the refusal status the seating service promises and a JSON body {"reason": "${options.expectedReason}", "message": <human message>}.`,
    }),
  ).toBe(`a refusal with the reason ${options.expectedReason}`);
  return { tag: "refused", statusCode: 0, reasonCode: "invalid-request", message: "", rawBody: "" };
};

const reportedSeat = (options: { readonly observation: SeatObservation; readonly stimulus: string }): ReportedSeat => {
  if (options.observation.tag === "reported") {
    return options.observation;
  }
  expect(
    summarise(options.observation),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.observation)} instead of the report of that seat.`,
      why: "Every observation of a seat is made through the public API, so a reader can only see what that answer carries.",
      how: 'Answer a seat of the configured seating area with HTTP 200 and a JSON body {"seatId": <identifier>, "status": "free" | "held" | "sold", ...}.',
    }),
  ).toBe("the report of that seat");
  return { tag: "reported", report: { seatId: "", status: "free" }, rawBody: "" };
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
      why: "A reader sees the seating area only through this answer, so a missing or unreadable answer hides every seat.",
      how: 'Answer the seating area with HTTP 200 and a JSON body {"seats": [ <seat report>, ... ]} listing every configured seat in the configured order.',
    }),
  ).toBe("the report of the whole seating area");
  return { tag: "reported", seats: [], rawBody: "" };
};

const reportedClock = (options: {
  readonly observation: ClockObservation;
  readonly stimulus: string;
}): ReportedTime => {
  if (options.observation.tag === "reported") {
    return options.observation;
  }
  expect(
    summarise(options.observation),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.observation)} instead of the time the seating service is using.`,
      why: "The deadline of a hold is a time, so a test and a demonstration can only judge it against the time the service itself reports.",
      how: 'Answer the demonstration clock with HTTP 200 and a JSON body carrying {"now": <whole seconds>} after the clock has moved.',
    }),
  ).toBe("the time the seating service is using");
  return { tag: "reported", nowSeconds: Number.NaN, rawBody: "" };
};

const reportedTime = (options: { readonly observation: ClockObservation; readonly stimulus: string }): number =>
  reportedClock(options).nowSeconds;

const fullReportOf = (
  report: SeatReport,
): { seatId: string; status: string; holder: string | null; deadline: number | null; owner: string | null } => ({
  seatId: report.seatId,
  status: report.status,
  holder: report.holder ?? null,
  deadline: report.deadline ?? null,
  owner: report.owner ?? null,
});

const aFreeSeatReport = (
  seat: string,
): { seatId: string; status: string; holder: string | null; deadline: number | null; owner: string | null } => ({
  seatId: seat,
  status: "free",
  holder: null,
  deadline: null,
  owner: null,
});

const aHeldSeatReport = (options: {
  readonly seat: string;
  readonly holder: string;
  readonly deadlineSeconds: number;
}): { seatId: string; status: string; holder: string | null; deadline: number | null; owner: string | null } => ({
  seatId: options.seat,
  status: "held",
  holder: options.holder,
  deadline: options.deadlineSeconds,
  owner: null,
});

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

const whenTheBookerHoldsTheSeat = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
}): Promise<HoldOutcome> => holdSeat({ service: options.service, seat: options.seat, booker: options.booker });

const theSeatingAreaNow = async (options: {
  readonly service: SeatingService;
}): Promise<ReportedSeatingArea> =>
  reportedSeatingArea({
    observation: await seatingArea({ service: options.service }),
    stimulus: "reading the whole seating area",
  });

const theSeatNow = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
}): Promise<ReportedSeat> =>
  reportedSeat({
    observation: await seatReport({ service: options.service, seat: options.seat }),
    stimulus: `reading seat ${options.seat}`,
  });

const thenTheBookerReceivesAHoldUntil = (options: {
  readonly outcome: HoldOutcome;
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly expectedDeadlineSeconds: number;
}): GrantedHold => {
  const granted = grantedHold({
    outcome: options.outcome,
    stimulus: `booker ${options.booker} holding the free seat ${options.seat}`,
  });
  expect(
    granted.deadlineSeconds,
    whatWhyHow({
      what: `the hold of ${options.booker} on seat ${options.seat} ends at ${granted.deadlineSeconds} instead of ${options.expectedDeadlineSeconds}.`,
      why: "The deadline a booker is given is the time of the grant plus the one hold duration the seating area was started with, and nothing else may change it.",
      how: "Read the clock once when the hold is granted and answer that time plus the configured hold duration in seconds.",
    }),
  ).toBe(options.expectedDeadlineSeconds);
  expect(
    hasOpaqueReferenceShape(granted.holdReference),
    whatWhyHow({
      what: `the hold reference "${granted.holdReference}" is not an opaque reference.`,
      why: "Only the booker holding the reference may later use the hold, so the reference must be drawn fresh by the service and must not be guessable from the seat or the booker name.",
      how: "Answer a fresh random UUID drawn by the hold reference port for every granted hold.",
    }),
  ).toBe(true);
  return granted;
};

const thenTheSeatIsReportedHeldFor = (options: {
  readonly report: SeatReport;
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly deadlineSeconds: number;
}): void => {
  expect(
    { seatId: options.report.seatId, status: options.report.status, holder: options.report.holder ?? null, deadline: options.report.deadline ?? null },
    whatWhyHow({
      what: `seat ${options.seat} is reported as ${summarise(options.report)} instead of held for ${options.booker} until ${options.deadlineSeconds}.`,
      why: "The value a booker is paying attention to is seeing the seat reported as theirs, with the deadline until which it is kept.",
      how: `Report a held seat with its identifier, the status "held", the holder name and the deadline of the hold in whole seconds.`,
    }),
  ).toEqual({
    seatId: String(options.seat),
    status: "held",
    holder: String(options.booker),
    deadline: options.deadlineSeconds,
  });
};

const thenNoAnswerCarriesTheHoldReference = (options: {
  readonly bodies: readonly string[];
  readonly holdReference: string;
  readonly stimulus: string;
}): void => {
  expect(
    options.bodies.filter((body) => body.includes(options.holdReference)),
    whatWhyHow({
      what: `${options.stimulus} carried the hold reference of the booker.`,
      why: "Only the booker who was given the reference may use the hold, so a public report that leaks it hands the hold to anybody who can read a seat.",
      how: "Return the hold reference once, in the answer to the hold that created it, and never in a seat report or in the seating area.",
    }),
  ).toEqual([]);
};

const whenTheDemonstrationClockIsMovedOnBy = async (options: {
  readonly service: SeatingService;
  readonly seconds: number;
}): Promise<ReportedTime> =>
  reportedClock({
    observation: await advanceClock({ service: options.service, seconds: options.seconds }),
    stimulus: `moving the demonstration clock on by ${options.seconds} seconds`,
  });

const whenTheDemonstrationClockIsAskedToMoveBy = async (options: {
  readonly service: SeatingService;
  readonly body: unknown;
}): Promise<ClockObservation> => advanceClockWithBody({ service: options.service, body: options.body });

type SeatingAreaAnOrganizerMayConfigure = {
  readonly description: string;
  readonly seats: readonly SeatId[];
};

const seatingAreasAnOrganizerMayConfigure: readonly SeatingAreaAnOrganizerMayConfigure[] = [
  { description: "the three seats s11, s12 and s13", seats: seatingAreaOfThreeSeats },
  { description: "the two seats a1 and a2", seats: [seatId("a1"), seatId("a2")] },
  { description: "the single seat only-seat", seats: [seatId("only-seat")] },
];

type AdvanceThatIsNotAPositiveWholeNumberOfSeconds = {
  readonly description: string;
  readonly body: unknown;
};

const advancesTheServiceCannotMake: readonly AdvanceThatIsNotAPositiveWholeNumberOfSeconds[] = [
  { description: "an advance of zero seconds", body: { seconds: 0 } },
  { description: "an advance of a negative number of seconds", body: { seconds: -5 } },
  { description: "an advance of a number of seconds that is not whole", body: { seconds: 0.5 } },
];

describe("Holding a free seat", () => {
  it.each(seatingAreasAnOrganizerMayConfigure)(
    "the seating area configured as $description is reported with every seat free before any command [po-shared-seating-area-is-reported]",
    async (configured: SeatingAreaAnOrganizerMayConfigure) => {
      const service = await startTestService({
        inventory: configured.seats,
        holdDurationSeconds: twoMinutes,
      });
      try {
        const beforeAnyCommand = await theSeatingAreaNow({ service });

        expect(
          beforeAnyCommand.seats.map(fullReportOf),
          whatWhyHow({
            what: `the seating area read before any command is ${summarise(beforeAnyCommand.seats)} instead of the configured seats ${configured.seats.join(", ")}, each free with no holder, no deadline and no owner.`,
            why: "A booker opening the seating area of a fresh event must see exactly the seats the organizer configured, each exactly once, and see that each of them can still be booked.",
            how: "Load the configured inventory at start, report every configured seat exactly once in the configured order and no seat the organizer did not configure, and report a seat nobody holds as free with no holder, no deadline and no owner.",
          }),
        ).toEqual(configured.seats.map((seat) => aFreeSeatReport(String(seat))));
      } finally {
        await service.stop();
      }
    },
  );

  it("the demonstration clock answers the time the service is using and moves it by exactly the seconds it is given [po-shared-seating-area-is-reported]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 * twoMinutes }), async (secondsToMoveOn) => {
        const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
        try {
          const timeBefore = await whenTheDemonstrationClockIsMovedOnBy({ service, seconds: 1 });

          const answer = await whenTheDemonstrationClockIsMovedOnBy({ service, seconds: secondsToMoveOn });

          expect(
            fieldsOfTheAnswer(answer.rawBody),
            whatWhyHow({
              what: `the demonstration clock answered the fields ${summarise(fieldsOfTheAnswer(answer.rawBody))} instead of the time alone.`,
              why: "The demonstration clock is reachable only under the demonstration route, and its answer promises the time the service is using and nothing else a client could come to depend on.",
              how: 'Answer the demonstration advance with HTTP 200 and the JSON body {"now": <whole seconds>}, carrying no other field.',
            }),
          ).toEqual(["now"]);
          expect(
            answer.nowSeconds,
            whatWhyHow({
              what: `advancing the demonstration clock by ${secondsToMoveOn} seconds moved the reported time from ${timeBefore.nowSeconds} to ${answer.nowSeconds} instead of ${timeBefore.nowSeconds + secondsToMoveOn}.`,
              why: "Every deadline is judged against the time the service reports, so a demonstration that moves the clock by a known amount must move that time by exactly that amount, however large the jump.",
              how: "Hold one offset, add exactly the seconds the advance was given to it, and answer the resulting whole second.",
            }),
          ).toBe(timeBefore.nowSeconds + secondsToMoveOn);
        } finally {
          await service.stop();
        }
      }),
      { numRuns: 8, examples: [[1], [5 * twoMinutes]] },
    );
  });

  it.each(advancesTheServiceCannotMake)(
    "$description is refused and leaves the seating area and the reported time untouched [law-wire-shape W-case-invalid-advance]",
    async (invalidAdvance: AdvanceThatIsNotAPositiveWholeNumberOfSeconds) => {
      const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
      try {
        const timeBefore = await givenTheClockHasMovedOn({ service, seconds: 1 });
        const seatingAreaBefore = (await theSeatingAreaNow({ service })).seats;

        const observation = await whenTheDemonstrationClockIsAskedToMoveBy({
          service,
          body: invalidAdvance.body,
        });

        const refused = refusedCommand({
          outcome: observation,
          stimulus: `asking the demonstration clock for ${invalidAdvance.description}`,
          expectedReason: "invalid-request",
        });
        expect(
          {
            statusCode: refused.statusCode,
            reasonCode: refused.reasonCode,
            carriesAHumanMessage: refused.message.length > 0,
            namesTheField: refused.rawBody.includes("seconds"),
          },
          whatWhyHow({
            what: `${invalidAdvance.description} answered ${summarise(refused)} instead of a refusal naming the field that failed.`,
            why: "The clock only ever moves forward by whole seconds, and a caller can repair its request only when the answer says which field was wrong.",
            how: 'Refuse an advance that is not a positive whole number of seconds with HTTP 400, the reason code "invalid-request", a human message and the path of the field that failed.',
          }),
        ).toEqual({ statusCode: 400, reasonCode: "invalid-request", carriesAHumanMessage: true, namesTheField: true });
        const seatingAreaAfter = (await theSeatingAreaNow({ service })).seats;
        expect(
          seatingAreaAfter,
          whatWhyHow({
            what: `after ${invalidAdvance.description} the seating area reads ${summarise(seatingAreaAfter)} instead of ${summarise(seatingAreaBefore)}.`,
            why: "A refused request must change nothing a reader can see, so a rejected demonstration advance can never take, release or extend a seat.",
            how: "Validate the body before anything is written, and write nothing on the refusing path.",
          }),
        ).toEqual(seatingAreaBefore);
        const timeAfter = await givenTheClockHasMovedOn({ service, seconds: 1 });
        expect(
          timeAfter,
          whatWhyHow({
            what: `after ${invalidAdvance.description} and one second of demonstration time the service reports ${timeAfter} instead of ${timeBefore + 1}.`,
            why: "A refused advance must leave the time the service is using exactly where it was, because every deadline is judged against that time.",
            how: "Move the clock only after the advance has been accepted, and only by the seconds it was given.",
          }),
        ).toBe(timeBefore + 1);
      } finally {
        await service.stop();
      }
    },
  );

  it("a booker holds a free seat and sees it held for them until the stated deadline", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      const timeOfTheGrant = await givenTheClockHasMovedOn({ service, seconds: 1 });

      const outcome = await whenTheBookerHoldsTheSeat({ service, seat: theChosenSeat, booker: bookers[0] });

      const granted = thenTheBookerReceivesAHoldUntil({
        outcome,
        seat: theChosenSeat,
        booker: bookers[0],
        expectedDeadlineSeconds: timeOfTheGrant + twoMinutes,
      });
      const atTheGrant = await theSeatNow({ service, seat: theChosenSeat });
      thenTheSeatIsReportedHeldFor({
        report: atTheGrant.report,
        seat: theChosenSeat,
        booker: bookers[0],
        deadlineSeconds: granted.deadlineSeconds,
      });
      await givenTheClockHasMovedOn({ service, seconds: twoMinutes - 1 });
      const oneSecondBeforeTheDeadline = await theSeatNow({ service, seat: theChosenSeat });
      thenTheSeatIsReportedHeldFor({
        report: oneSecondBeforeTheDeadline.report,
        seat: theChosenSeat,
        booker: bookers[0],
        deadlineSeconds: granted.deadlineSeconds,
      });
      const wholeSeatingArea = await theSeatingAreaNow({ service });
      expect(
        wholeSeatingArea.seats.map(fullReportOf),
        whatWhyHow({
          what: `the seating area is reported as ${summarise(wholeSeatingArea.seats)} instead of the three configured seats with only ${theChosenSeat} held for ${bookers[0]} until ${granted.deadlineSeconds}, s11 and s13 untouched.`,
          why: "Holding one seat must take that seat and no other: a seat somebody else can still book must carry no holder, no deadline and no owner.",
          how: "Report every configured seat exactly once, in the configured order, change only the seat that was held, and leave every other seat free with no holder, no deadline and no owner.",
        }),
      ).toEqual([
        aFreeSeatReport("s11"),
        aHeldSeatReport({ seat: "s12", holder: String(bookers[0]), deadlineSeconds: granted.deadlineSeconds }),
        aFreeSeatReport("s13"),
      ]);
      thenNoAnswerCarriesTheHoldReference({
        bodies: [atTheGrant.rawBody, oneSecondBeforeTheDeadline.rawBody, wholeSeatingArea.rawBody],
        holdReference: granted.holdReference,
        stimulus: "a seat report or the seating area read after the hold",
      });
    } finally {
      await service.stop();
    }
  });

  it("the seating area refuses a second booker the seat somebody already holds, and the first holder keeps it [law-hold-only-on-free]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seat: fc.constantFrom(...seatingAreaOfThreeSeats),
          bookerPair: fc.constantFrom(...bookerPairs),
          secondsBeforeTheSecondBooker: fc.integer({ min: 1, max: twoMinutes - 2 }),
        }),
        async (scenario) => {
          const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
          try {
            const timeOfTheGrant = await givenTheClockHasMovedOn({ service, seconds: 1 });
            const granted = thenTheBookerReceivesAHoldUntil({
              outcome: await whenTheBookerHoldsTheSeat({
                service,
                seat: scenario.seat,
                booker: scenario.bookerPair.first,
              }),
              seat: scenario.seat,
              booker: scenario.bookerPair.first,
              expectedDeadlineSeconds: timeOfTheGrant + twoMinutes,
            });
            await givenTheClockHasMovedOn({ service, seconds: scenario.secondsBeforeTheSecondBooker });

            const outcome = await whenTheBookerHoldsTheSeat({
              service,
              seat: scenario.seat,
              booker: scenario.bookerPair.second,
            });

            const refused = refusedCommand({
              outcome,
              stimulus: `booker ${scenario.bookerPair.second} holding seat ${scenario.seat} while ${scenario.bookerPair.first} holds it`,
              expectedReason: "seat-held",
            });
            expect(
              { statusCode: refused.statusCode, reasonCode: refused.reasonCode },
              whatWhyHow({
                what: `the second booker was answered ${summarise(refused)} instead of a refusal naming that the seat is held.`,
                why: "One seat is never given to two bookers, and the second booker must learn why without reading the source.",
                how: 'Answer a hold on a held seat with HTTP 409 and the reason code "seat-held".',
              }),
            ).toEqual({ statusCode: 409, reasonCode: "seat-held" });
            thenTheSeatIsReportedHeldFor({
              report: (await theSeatNow({ service, seat: scenario.seat })).report,
              seat: scenario.seat,
              booker: scenario.bookerPair.first,
              deadlineSeconds: granted.deadlineSeconds,
            });
          } finally {
            await service.stop();
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("a refused request leaves the seating area and the time it reports exactly as they were [law-refusal-is-inert]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          refusalKind: fc.constantFrom("a seat the seating area does not have", "a hold that names no booker"),
          heldSeat: fc.constantFrom(...seatingAreaOfThreeSeats),
          booker: fc.constantFrom(...bookers),
          secondsBeforeTheRefusal: fc.integer({ min: 1, max: twoMinutes - 2 }),
        }),
        async (scenario) => {
          const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
          try {
            const timeOfTheGrant = await givenTheClockHasMovedOn({ service, seconds: 1 });
            thenTheBookerReceivesAHoldUntil({
              outcome: await whenTheBookerHoldsTheSeat({
                service,
                seat: scenario.heldSeat,
                booker: scenario.booker,
              }),
              seat: scenario.heldSeat,
              booker: scenario.booker,
              expectedDeadlineSeconds: timeOfTheGrant + twoMinutes,
            });
            const timeBefore = await givenTheClockHasMovedOn({
              service,
              seconds: scenario.secondsBeforeTheRefusal,
            });
            const seatingAreaBefore = (await theSeatingAreaNow({ service })).seats;

            const outcome =
              scenario.refusalKind === "a seat the seating area does not have"
                ? await whenTheBookerHoldsTheSeat({
                    service,
                    seat: aSeatThatWasNeverConfigured,
                    booker: scenario.booker,
                  })
                : await holdSeatWithoutNamingTheBooker({ service, seat: scenario.heldSeat });

            refusedCommand({
              outcome,
              stimulus: `a hold refused because of ${scenario.refusalKind}`,
              expectedReason:
                scenario.refusalKind === "a seat the seating area does not have" ? "no-such-seat" : "invalid-request",
            });
            const seatingAreaAfter = (await theSeatingAreaNow({ service })).seats;
            expect(
              seatingAreaAfter,
              whatWhyHow({
                what: `after a request refused because of ${scenario.refusalKind} the seating area reads ${summarise(seatingAreaAfter)} instead of ${summarise(seatingAreaBefore)}.`,
                why: "A refusal must change nothing a reader can see, so that a refused request can never quietly take, release or extend a seat.",
                how: "Decide a refusal before anything is written, and write nothing on the refusing path.",
              }),
            ).toEqual(seatingAreaBefore);
            const timeAfter = await givenTheClockHasMovedOn({ service, seconds: 1 });
            expect(
              timeAfter,
              whatWhyHow({
                what: `the time the service reports moved to ${timeAfter} instead of ${timeBefore + 1} across a refusal and one second of demonstration time.`,
                why: "A refusal must not move the time the service is using, because every deadline is judged against that time.",
                how: "Move the clock only in the demonstration advance operation, and only by the seconds it was given.",
              }),
            ).toBe(timeBefore + 1);
          } finally {
            await service.stop();
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("reading the seating area twice in a row shows the same seats [law-report-is-idempotent]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seat: fc.constantFrom(...seatingAreaOfThreeSeats),
          booker: fc.constantFrom(...bookers),
          secondsBeforeTheReading: fc.integer({ min: 1, max: twoMinutes - 2 }),
        }),
        async (scenario) => {
          const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
          try {
            await whenTheBookerHoldsTheSeat({ service, seat: scenario.seat, booker: scenario.booker });
            await givenTheClockHasMovedOn({ service, seconds: scenario.secondsBeforeTheReading });

            const firstReading = (await theSeatingAreaNow({ service })).seats;

            const secondReading = (await theSeatingAreaNow({ service })).seats;
            expect(
              secondReading,
              whatWhyHow({
                what: `reading the seating area twice in a row gave ${summarise(secondReading)} after ${summarise(firstReading)}.`,
                why: "Reading the seating area must never change it, or a reader would be the cause of what they are reporting.",
                how: "Compute the report from the stored seats and the clock, and write nothing while reporting.",
              }),
            ).toEqual(firstReading);
          } finally {
            await service.stop();
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("the seat stays held for its booker at every moment before the deadline [law-every-hold-is-released]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .integer({ min: 10, max: 300 })
          .chain((holdDurationSeconds) =>
            fc.record({
              holdDurationSeconds: fc.constant(holdDurationSeconds),
              seat: fc.constantFrom(...seatingAreaOfThreeSeats),
              booker: fc.constantFrom(...bookers),
              secondsIntoTheHold: fc.integer({ min: 1, max: holdDurationSeconds - 1 }),
            }),
          ),
        async (scenario) => {
          const service = await givenAFreeSeatingAreaOfThreeSeats({
            holdDurationSeconds: scenario.holdDurationSeconds,
          });
          try {
            const timeOfTheGrant = await givenTheClockHasMovedOn({ service, seconds: 1 });
            const granted = thenTheBookerReceivesAHoldUntil({
              outcome: await whenTheBookerHoldsTheSeat({
                service,
                seat: scenario.seat,
                booker: scenario.booker,
              }),
              seat: scenario.seat,
              booker: scenario.booker,
              expectedDeadlineSeconds: timeOfTheGrant + scenario.holdDurationSeconds,
            });

            await givenTheClockHasMovedOn({ service, seconds: scenario.secondsIntoTheHold });

            thenTheSeatIsReportedHeldFor({
              report: (await theSeatNow({ service, seat: scenario.seat })).report,
              seat: scenario.seat,
              booker: scenario.booker,
              deadlineSeconds: granted.deadlineSeconds,
            });
          } finally {
            await service.stop();
          }
        },
      ),
      {
        numRuns: 10,
        examples: [
          [
            {
              holdDurationSeconds: twoMinutes,
              seat: theChosenSeat,
              booker: bookers[0],
              secondsIntoTheHold: twoMinutes - 1,
            },
          ],
        ],
      },
    );
  });

  it("the deadline a booker receives is the time of the grant plus the hold duration [law-deadline-is-now-plus-duration]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seat: fc.constantFrom(...seatingAreaOfThreeSeats),
          booker: fc.constantFrom(...bookers),
          holdDurationSeconds: fc.integer({ min: 1, max: 300 }),
          secondsBeforeTheHold: fc.integer({ min: 1, max: 300 }),
        }),
        async (scenario) => {
          const service = await givenAFreeSeatingAreaOfThreeSeats({
            holdDurationSeconds: scenario.holdDurationSeconds,
          });
          try {
            const timeOfTheGrant = await givenTheClockHasMovedOn({
              service,
              seconds: scenario.secondsBeforeTheHold,
            });

            const outcome = await whenTheBookerHoldsTheSeat({
              service,
              seat: scenario.seat,
              booker: scenario.booker,
            });

            thenTheBookerReceivesAHoldUntil({
              outcome,
              seat: scenario.seat,
              booker: scenario.booker,
              expectedDeadlineSeconds: timeOfTheGrant + scenario.holdDurationSeconds,
            });
          } finally {
            await service.stop();
          }
        },
      ),
      { numRuns: 12 },
    );
  });

  it("the hold reference belongs to the booker alone and never appears in a seat report [cc-opaque-reference]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seats: fc.constantFrom(
            { first: seatingAreaOfThreeSeats[0], second: seatingAreaOfThreeSeats[1] },
            { first: seatingAreaOfThreeSeats[1], second: seatingAreaOfThreeSeats[2] },
            { first: seatingAreaOfThreeSeats[0], second: seatingAreaOfThreeSeats[2] },
          ),
          booker: fc.constantFrom(...bookers),
        }),
        async (scenario) => {
          const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
          try {
            const timeOfTheGrant = await givenTheClockHasMovedOn({ service, seconds: 1 });
            const firstGrant = thenTheBookerReceivesAHoldUntil({
              outcome: await whenTheBookerHoldsTheSeat({
                service,
                seat: scenario.seats.first,
                booker: scenario.booker,
              }),
              seat: scenario.seats.first,
              booker: scenario.booker,
              expectedDeadlineSeconds: timeOfTheGrant + twoMinutes,
            });

            const secondGrant = thenTheBookerReceivesAHoldUntil({
              outcome: await whenTheBookerHoldsTheSeat({
                service,
                seat: scenario.seats.second,
                booker: scenario.booker,
              }),
              seat: scenario.seats.second,
              booker: scenario.booker,
              expectedDeadlineSeconds: timeOfTheGrant + twoMinutes,
            });

            expect(
              {
                sameReferenceTwice: firstGrant.holdReference === secondGrant.holdReference,
                namesTheSeat: firstGrant.holdReference.includes(String(scenario.seats.first)),
                namesTheBooker: firstGrant.holdReference.includes(String(scenario.booker)),
              },
              whatWhyHow({
                what: `the hold references ${firstGrant.holdReference} and ${secondGrant.holdReference} can be derived from the seat, from the booker, or from each other.`,
                why: "A booker who can build somebody else's reference can take their hold, so the reference must be drawn fresh and carry nothing a stranger already knows.",
                how: "Draw every hold reference from the random UUID generator behind the hold reference port, and build it from no request value.",
              }),
            ).toEqual({ sameReferenceTwice: false, namesTheSeat: false, namesTheBooker: false });
            thenNoAnswerCarriesTheHoldReference({
              bodies: [
                (await theSeatNow({ service, seat: scenario.seats.first })).rawBody,
                (await theSeatNow({ service, seat: scenario.seats.second })).rawBody,
                (await theSeatingAreaNow({ service })).rawBody,
              ],
              holdReference: firstGrant.holdReference,
              stimulus: "a seat report or the seating area read after two holds of the same booker",
            });
          } finally {
            await service.stop();
          }
        },
      ),
      { numRuns: 8 },
    );
  });

  it("a hold for a seat the seating area does not have is refused and names the seat that was asked for [law-wire-shape]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      const outcome = await whenTheBookerHoldsTheSeat({
        service,
        seat: aSeatThatWasNeverConfigured,
        booker: bookers[0],
      });

      const refused = refusedCommand({
        outcome,
        stimulus: `booker ${bookers[0]} holding the seat ${aSeatThatWasNeverConfigured}, which the seating area does not have`,
        expectedReason: "no-such-seat",
      });
      expect(
        {
          statusCode: refused.statusCode,
          reasonCode: refused.reasonCode,
          namesTheSeat: refused.rawBody.includes(String(aSeatThatWasNeverConfigured)),
        },
        whatWhyHow({
          what: `holding an unknown seat answered ${summarise(refused)} instead of a refusal naming the unknown seat.`,
          why: "A caller who asks for a seat that is not in the fixed seating area must be able to repair the request without reading the source.",
          how: 'Answer an unknown seat with HTTP 404, the reason code "no-such-seat" and the identifier that was sent.',
        }),
      ).toEqual({ statusCode: 404, reasonCode: "no-such-seat", namesTheSeat: true });
    } finally {
      await service.stop();
    }
  });

  it("a hold that names no booker is refused and names the missing field [law-wire-shape W-case-invalid-booker]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      const outcome = await holdSeatWithoutNamingTheBooker({ service, seat: theChosenSeat });

      const refused = refusedCommand({
        outcome,
        stimulus: `holding seat ${theChosenSeat} without naming the booker`,
        expectedReason: "invalid-request",
      });
      expect(
        {
          statusCode: refused.statusCode,
          reasonCode: refused.reasonCode,
          namesTheField: refused.rawBody.includes("booker"),
        },
        whatWhyHow({
          what: `a hold without a booker name answered ${summarise(refused)} instead of a refusal naming the field that was missing.`,
          why: "A client can only repair its request when the answer says which field was wrong and what was expected.",
          how: 'Answer a body that fails its schema with HTTP 400, the reason code "invalid-request" and the path of the field that failed.',
        }),
      ).toEqual({ statusCode: 400, reasonCode: "invalid-request", namesTheField: true });
    } finally {
      await service.stop();
    }
  });

  it("a restart empties every hold and the seating area is reported free again", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    const beforeTheRestart = await (async (): Promise<readonly SeatReport[]> => {
      try {
        const timeOfTheGrant = await givenTheClockHasMovedOn({ service, seconds: 1 });
        thenTheBookerReceivesAHoldUntil({
          outcome: await whenTheBookerHoldsTheSeat({ service, seat: theChosenSeat, booker: bookers[0] }),
          seat: theChosenSeat,
          booker: bookers[0],
          expectedDeadlineSeconds: timeOfTheGrant + twoMinutes,
        });
        return (await theSeatingAreaNow({ service })).seats;
      } finally {
        await service.stop();
      }
    })();

    const restarted = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      const afterTheRestart = (await theSeatingAreaNow({ service: restarted })).seats;
      expect(
        afterTheRestart.map((seat) => ({ seatId: seat.seatId, status: seat.status })),
        whatWhyHow({
          what: `after a restart the seating area reads ${summarise(afterTheRestart)} instead of the three configured seats, all free, which it held as ${summarise(beforeTheRestart)} before the restart.`,
          why: "All state lives in one process and nothing survives a restart, so a reader after a restart must see the fixed seating area with every seat free.",
          how: "Load the configured seating area at start with every seat free, and keep no state outside the running process.",
        }),
      ).toEqual([
        { seatId: "s11", status: "free" },
        { seatId: "s12", status: "free" },
        { seatId: "s13", status: "free" },
      ]);
    } finally {
      await restarted.stop();
    }
  });
});
