import { randomUUID } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  advanceClock,
  bookerName,
  confirmHold,
  holdSeat,
  seatId,
  seatReport,
  seatingArea,
  summarise,
  type BookerName,
  type ClockObservation,
  type ConfirmOutcome,
  type ConfirmedSale,
  type GrantedHold,
  type HoldOutcome,
  type RefusedCommand,
  type ReportedSeat,
  type ReportedSeatingArea,
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
];
const seatPairs = [
  { first: seatingAreaOfThreeSeats[0], second: seatingAreaOfThreeSeats[1] },
  { first: seatingAreaOfThreeSeats[1], second: seatingAreaOfThreeSeats[2] },
  { first: seatingAreaOfThreeSeats[0], second: seatingAreaOfThreeSeats[2] },
];
const twoMinutes = 120;
const longAfterTheDeadline = 600;

type FollowingCommand = "a hold by another booker" | "a confirmation with the old reference" | "a clock advance";

const orderingsOfTheCommandsAfterASale: readonly (readonly FollowingCommand[])[] = [
  ["a hold by another booker", "a confirmation with the old reference", "a clock advance"],
  ["a hold by another booker", "a clock advance", "a confirmation with the old reference"],
  ["a confirmation with the old reference", "a hold by another booker", "a clock advance"],
  ["a confirmation with the old reference", "a clock advance", "a hold by another booker"],
  ["a clock advance", "a hold by another booker", "a confirmation with the old reference"],
  ["a clock advance", "a confirmation with the old reference", "a hold by another booker"],
];

type AHoldReferenceTheWireCannotRead = { readonly description: string; readonly holdReference: string };

const holdReferencesTheWireCannotRead: readonly AHoldReferenceTheWireCannotRead[] = [
  { description: "a hold reference that is a word", holdReference: "not-a-uuid" },
  { description: "a hold reference that is a number", holdReference: "12345" },
  { description: "a hold reference that is half a UUID", holdReference: "550e8400-e29b-41d4-a716" },
  {
    description: "a hold reference that is a UUID with its hyphens removed",
    holdReference: "550e8400e29b41d4a716446655440000",
  },
];

const whatWhyHow = (parts: { readonly what: string; readonly why: string; readonly how: string }): string =>
  `WHAT: ${parts.what}\nWHY: ${parts.why}\nHOW: ${parts.how}`;

const asSoldTo = (options: { readonly report: SeatReport; readonly seat: SeatId; readonly booker: BookerName }) => ({
  observed: {
    seatId: options.report.seatId,
    status: options.report.status,
    owner: options.report.owner ?? null,
    holder: options.report.holder ?? null,
    deadline: options.report.deadline ?? null,
  },
  promised: {
    seatId: String(options.seat),
    status: "sold",
    owner: String(options.booker),
    holder: null,
    deadline: null,
  },
});

const grantedHold = (options: { readonly outcome: HoldOutcome; readonly stimulus: string }): GrantedHold => {
  if (options.outcome.tag === "granted") {
    return options.outcome;
  }
  expect(
    summarise(options.outcome),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.outcome)} instead of a granted hold carrying a hold reference and a deadline.`,
      why: "A booker can only confirm a seat they are holding, so the hold that opens this journey must be granted and must hand back the reference that makes the seat theirs.",
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
      why: "Confirming before the deadline is how a booker turns a hold into a seat that is theirs, and they can only see that in the answer to the confirmation.",
      how: 'Answer a confirmation sent before the deadline with HTTP 200 and the report of that seat as sold: {"seatId": <identifier>, "status": "sold", "owner": <booker name>}.',
    }),
  ).toBe("the seat sold to the booker who was holding it");
  return { tag: "confirmed", report: { seatId: "", status: "free" }, rawBody: "" };
};

const refusedCommand = (options: {
  readonly outcome: ConfirmOutcome | HoldOutcome;
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
      why: "A request the seating service cannot grant must be refused in a way a client can act on, never answered as a success and never answered as prose.",
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

const reportedTime = (options: { readonly observation: ClockObservation; readonly stimulus: string }): number => {
  if (options.observation.tag === "reported") {
    return options.observation.nowSeconds;
  }
  expect(
    summarise(options.observation),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.observation)} instead of the time the seating service is using.`,
      why: "A deadline is a time, so a booker and a demonstration can only judge a confirmation against the time the service itself reports.",
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

const theSeatNow = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
}): Promise<ReportedSeat> =>
  reportedSeat({
    observation: await seatReport({ service: options.service, seat: options.seat }),
    stimulus: `reading seat ${options.seat}`,
  });

const theSeatingAreaNow = async (options: {
  readonly service: SeatingService;
}): Promise<readonly SeatReport[]> =>
  reportedSeatingArea({
    observation: await seatingArea({ service: options.service }),
    stimulus: "reading the whole seating area",
  }).seats;

const whenTheHolderConfirmsTheSeat = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly holdReference: string;
}): Promise<ConfirmOutcome> =>
  confirmHold({ service: options.service, seat: options.seat, holdReference: options.holdReference });

const whenTheBookerHoldsTheSeat = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
}): Promise<HoldOutcome> => holdSeat({ service: options.service, seat: options.seat, booker: options.booker });

const sendOneCommandAfterTheSale = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly command: FollowingCommand;
  readonly otherBooker: BookerName;
  readonly holdReference: string;
  readonly advanceSeconds: number;
}): Promise<void> => {
  const commands: Record<FollowingCommand, () => Promise<unknown>> = {
    "a hold by another booker": () =>
      holdSeat({ service: options.service, seat: options.seat, booker: options.otherBooker }),
    "a confirmation with the old reference": () =>
      confirmHold({ service: options.service, seat: options.seat, holdReference: options.holdReference }),
    "a clock advance": () => advanceClock({ service: options.service, seconds: options.advanceSeconds }),
  };
  await commands[options.command]();
};

const whenTheseCommandsFollowTheSale = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly ordering: readonly FollowingCommand[];
  readonly otherBooker: BookerName;
  readonly holdReference: string;
  readonly advanceSeconds: number;
  readonly seen?: readonly SeatReport[];
}): Promise<readonly SeatReport[]> => {
  const seen = options.seen ?? [];
  const [next, ...rest] = options.ordering;
  if (next === undefined) {
    return seen;
  }
  await sendOneCommandAfterTheSale({
    service: options.service,
    seat: options.seat,
    command: next,
    otherBooker: options.otherBooker,
    holdReference: options.holdReference,
    advanceSeconds: options.advanceSeconds,
  });
  return whenTheseCommandsFollowTheSale({
    ...options,
    ordering: rest,
    seen: [...seen, (await theSeatNow({ service: options.service, seat: options.seat })).report],
  });
};

const thenTheSeatIsReportedSoldTo = (options: {
  readonly report: SeatReport;
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly stimulus: string;
}): void => {
  const sale = asSoldTo({ report: options.report, seat: options.seat, booker: options.booker });
  expect(
    sale.observed,
    whatWhyHow({
      what: `${options.stimulus} reports seat ${options.seat} as ${summarise(options.report)} instead of sold to ${options.booker} with no deadline and no holder.`,
      why: "A booker who has confirmed has bought the seat: it must be named as theirs, and it must carry no deadline that could ever release it again.",
      how: 'Report a sold seat with its identifier, the status "sold" and the owner name only, and write no deadline and no hold reference on it.',
    }),
  ).toEqual(sale.promised);
};

const thenTheSeatIsReportedHeldFor = (options: {
  readonly report: SeatReport;
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly deadlineSeconds: number;
  readonly stimulus: string;
}): void => {
  expect(
    {
      seatId: options.report.seatId,
      status: options.report.status,
      holder: options.report.holder ?? null,
      deadline: options.report.deadline ?? null,
    },
    whatWhyHow({
      what: `${options.stimulus} reports seat ${options.seat} as ${summarise(options.report)} instead of still held for ${options.booker} until ${options.deadlineSeconds}.`,
      why: "A request from somebody who is not the holder must leave the hold exactly where it was, or a stranger could take or end another booker's hold.",
      how: "Compare the hold reference that was presented with the one the hold was granted with, and write nothing at all when they differ.",
    }),
  ).toEqual({
    seatId: String(options.seat),
    status: "held",
    holder: String(options.booker),
    deadline: options.deadlineSeconds,
  });
};

const thenTheSeatIsReportedFree = (options: {
  readonly report: SeatReport;
  readonly seat: SeatId;
  readonly stimulus: string;
}): void => {
  expect(
    {
      seatId: options.report.seatId,
      status: options.report.status,
      holder: options.report.holder ?? null,
      deadline: options.report.deadline ?? null,
    },
    whatWhyHow({
      what: `${options.stimulus} reports seat ${options.seat} as ${summarise(options.report)} instead of free.`,
      why: "The deadline is the whole promise of a hold: once it is reached the seat belongs to nobody and the next booker must be able to take it.",
      how: "Compare the deadline of the stored hold with the time the service is using on every read and on every command, and report a seat whose deadline has been reached as free.",
    }),
  ).toEqual({ seatId: String(options.seat), status: "free", holder: null, deadline: null });
};

const thenTheSeatingAreaIsUnchanged = (options: {
  readonly before: readonly SeatReport[];
  readonly after: readonly SeatReport[];
  readonly stimulus: string;
}): void => {
  expect(
    options.after,
    whatWhyHow({
      what: `after ${options.stimulus} the seating area reads ${summarise(options.after)} instead of ${summarise(options.before)}.`,
      why: "A refusal must change nothing a reader can see, so that a refused request can never quietly take, sell, release or extend a seat.",
      how: "Decide a refusal before anything is written, and write nothing on the refusing path.",
    }),
  ).toEqual(options.before);
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
      why: "The reference is what proves a booker is the holder, so an answer that repeats it hands that proof to anybody who can read a seat.",
      how: "Return the hold reference once, in the answer to the hold that created it, and never in a confirmation, a seat report or the seating area.",
    }),
  ).toEqual([]);
};

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

const thenTheDeadlineDecidedTheConfirmation = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly outcome: ConfirmOutcome;
  readonly timeOfTheConfirmation: number;
  readonly deadlineSeconds: number;
  readonly seatingAreaBefore: readonly SeatReport[];
}): Promise<void> => {
  const stimulus = `confirming seat ${options.seat} at ${options.timeOfTheConfirmation} with a deadline of ${options.deadlineSeconds}`;
  if (options.timeOfTheConfirmation < options.deadlineSeconds) {
    thenTheSeatIsReportedSoldTo({
      report: confirmedSale({ outcome: options.outcome, stimulus }).report,
      seat: options.seat,
      booker: options.booker,
      stimulus: `the answer to ${stimulus}`,
    });
    return;
  }
  thenTheRefusalSays({
    refused: refusedCommand({ outcome: options.outcome, stimulus, expectedReason: "hold-expired" }),
    stimulus,
    expectedStatus: 409,
    expectedReason: "hold-expired",
    why: "The deadline is authoritative and there is no grace window, so a confirmation that arrives at the deadline second or later must be refused and the booker must learn that their time ran out.",
    how: 'Refuse a confirmation whose hold deadline the clock has reached with HTTP 409 and the reason code "hold-expired".',
  });
  thenTheSeatIsReportedFree({
    report: (await theSeatNow({ service: options.service, seat: options.seat })).report,
    seat: options.seat,
    stimulus: `the seat report taken after ${stimulus}`,
  });
  thenTheSeatingAreaIsUnchanged({
    before: options.seatingAreaBefore,
    after: await theSeatingAreaNow({ service: options.service }),
    stimulus: stimulus,
  });
};

const thenTheSeatStaysSoldAfterTheOldDeadlineHasPassed = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly reportAtTheSale: SeatReport;
}): Promise<void> => {
  await givenTheClockHasMovedOn({ service: options.service, seconds: longAfterTheDeadline });
  const later = await theSeatNow({ service: options.service, seat: options.seat });
  thenTheSeatIsReportedSoldTo({
    report: later.report,
    seat: options.seat,
    booker: options.booker,
    stimulus: `the seat report taken ${longAfterTheDeadline} seconds after the sale, long after the deadline the hold had`,
  });
  expect(
    later.report,
    whatWhyHow({
      what: `long after the deadline the hold had, seat ${options.seat} reads ${summarise(later.report)} instead of ${summarise(options.reportAtTheSale)}.`,
      why: "A sale is final: time passing must never take a seat back from the booker who paid attention and confirmed it.",
      how: "Keep no deadline on a sold seat, and apply the expiry comparison only to seats that are still held.",
    }),
  ).toEqual(options.reportAtTheSale);
};

describe("Confirming a held seat", () => {
  it("the holder confirms their seat before the deadline and the seat is theirs for good", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      const timeOfTheGrant = await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({ service, seat: theChosenSeat, booker: bookers[0] });
      await givenTheClockHasMovedOn({ service, seconds: twoMinutes - 1 });

      const outcome = await whenTheHolderConfirmsTheSeat({
        service,
        seat: theChosenSeat,
        holdReference: granted.holdReference,
      });

      const sale = confirmedSale({
        outcome,
        stimulus: `booker ${bookers[0]} confirming seat ${theChosenSeat} one second before the deadline ${timeOfTheGrant + twoMinutes}`,
      });
      thenTheSeatIsReportedSoldTo({
        report: sale.report,
        seat: theChosenSeat,
        booker: bookers[0],
        stimulus: "the answer to the confirmation",
      });
      const atTheSale = await theSeatNow({ service, seat: theChosenSeat });
      thenTheSeatIsReportedSoldTo({
        report: atTheSale.report,
        seat: theChosenSeat,
        booker: bookers[0],
        stimulus: "the seat report taken right after the confirmation",
      });
      thenNoAnswerCarriesTheHoldReference({
        bodies: [sale.rawBody, atTheSale.rawBody, JSON.stringify(await theSeatingAreaNow({ service }))],
        holdReference: granted.holdReference,
        stimulus: "the confirmation, the seat report or the seating area read after the sale",
      });
      await thenTheSeatStaysSoldAfterTheOldDeadlineHasPassed({
        service,
        seat: theChosenSeat,
        booker: bookers[0],
        reportAtTheSale: atTheSale.report,
      });
    } finally {
      await service.stop();
    }
  });

  it("a confirmation is granted before the deadline and refused from the deadline second on [law-deadline-is-authoritative]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seat: fc.constantFrom(...seatingAreaOfThreeSeats),
          booker: fc.constantFrom(...bookers),
          holdDurationSeconds: fc.integer({ min: 10, max: 300 }),
          secondsUntilTheConfirmation: fc.integer({ min: 1, max: 600 }),
        }),
        async (scenario) => {
          const service = await givenAFreeSeatingAreaOfThreeSeats({
            holdDurationSeconds: scenario.holdDurationSeconds,
          });
          try {
            await givenTheClockHasMovedOn({ service, seconds: 1 });
            const granted = await givenTheBookerHoldsTheSeat({
              service,
              seat: scenario.seat,
              booker: scenario.booker,
            });
            const timeOfTheConfirmation = await givenTheClockHasMovedOn({
              service,
              seconds: scenario.secondsUntilTheConfirmation,
            });
            const seatingAreaBefore = await theSeatingAreaNow({ service });

            const outcome = await whenTheHolderConfirmsTheSeat({
              service,
              seat: scenario.seat,
              holdReference: granted.holdReference,
            });

            await thenTheDeadlineDecidedTheConfirmation({
              service,
              seat: scenario.seat,
              booker: scenario.booker,
              outcome,
              timeOfTheConfirmation,
              deadlineSeconds: granted.deadlineSeconds,
              seatingAreaBefore,
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
              seat: theChosenSeat,
              booker: bookers[0],
              holdDurationSeconds: twoMinutes,
              secondsUntilTheConfirmation: twoMinutes - 1,
            },
          ],
          [
            {
              seat: theChosenSeat,
              booker: bookers[0],
              holdDurationSeconds: twoMinutes,
              secondsUntilTheConfirmation: twoMinutes,
            },
          ],
          [
            {
              seat: theChosenSeat,
              booker: bookers[1],
              holdDurationSeconds: twoMinutes,
              secondsUntilTheConfirmation: twoMinutes + longAfterTheDeadline,
            },
          ],
        ],
      },
    );
  });

  it("a booker holding one seat cannot confirm another booker's seat with their own reference [law-only-the-holder-acts]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seats: fc.constantFrom(...seatPairs),
          bookerPair: fc.constantFrom(...bookerPairs),
          secondsBeforeTheConfirmation: fc.integer({ min: 1, max: twoMinutes - 2 }),
        }),
        async (scenario) => {
          const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
          try {
            await givenTheClockHasMovedOn({ service, seconds: 1 });
            const heldByTheFirst = await givenTheBookerHoldsTheSeat({
              service,
              seat: scenario.seats.first,
              booker: scenario.bookerPair.first,
            });
            const heldByTheSecond = await givenTheBookerHoldsTheSeat({
              service,
              seat: scenario.seats.second,
              booker: scenario.bookerPair.second,
            });
            await givenTheClockHasMovedOn({ service, seconds: scenario.secondsBeforeTheConfirmation });
            const seatingAreaBefore = await theSeatingAreaNow({ service });

            const outcome = await whenTheHolderConfirmsTheSeat({
              service,
              seat: scenario.seats.first,
              holdReference: heldByTheSecond.holdReference,
            });

            const stimulus = `booker ${scenario.bookerPair.second} confirming seat ${scenario.seats.first}, which ${scenario.bookerPair.first} holds, with the reference of their own hold on ${scenario.seats.second}`;
            thenTheRefusalSays({
              refused: refusedCommand({ outcome, stimulus, expectedReason: "no-such-hold" }),
              stimulus,
              expectedStatus: 404,
              expectedReason: "no-such-hold",
              why: "Only the booker who was given the reference of that hold may confirm it, and the answer must not tell a stranger whether the reference they tried exists somewhere else.",
              how: 'Refuse a confirmation whose reference is not the reference of the hold on that seat with HTTP 404 and the reason code "no-such-hold", with no further detail.',
            });
            thenTheSeatIsReportedHeldFor({
              report: (await theSeatNow({ service, seat: scenario.seats.first })).report,
              seat: scenario.seats.first,
              booker: scenario.bookerPair.first,
              deadlineSeconds: heldByTheFirst.deadlineSeconds,
              stimulus: "the seat report taken after the refused confirmation",
            });
            thenTheSeatingAreaIsUnchanged({
              before: seatingAreaBefore,
              after: await theSeatingAreaNow({ service }),
              stimulus: "a confirmation carrying the reference of another seat's hold",
            });
          } finally {
            await service.stop();
          }
        },
      ),
      { numRuns: 8 },
    );
  });

  it("a sold seat stays sold to the same booker whatever is asked of it afterwards [law-sold-is-absorbing]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seat: fc.constantFrom(...seatingAreaOfThreeSeats),
          bookerPair: fc.constantFrom(...bookerPairs),
          ordering: fc.constantFrom(...orderingsOfTheCommandsAfterASale),
          advanceSeconds: fc.integer({ min: 1, max: 1000 }),
        }),
        async (scenario) => {
          const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
          try {
            await givenTheClockHasMovedOn({ service, seconds: 1 });
            const granted = await givenTheBookerHoldsTheSeat({
              service,
              seat: scenario.seat,
              booker: scenario.bookerPair.first,
            });
            confirmedSale({
              outcome: await whenTheHolderConfirmsTheSeat({
                service,
                seat: scenario.seat,
                holdReference: granted.holdReference,
              }),
              stimulus: `booker ${scenario.bookerPair.first} confirming seat ${scenario.seat} while they hold it`,
            });

            const reportsAfterEachCommand = await whenTheseCommandsFollowTheSale({
              service,
              seat: scenario.seat,
              ordering: scenario.ordering,
              otherBooker: scenario.bookerPair.second,
              holdReference: granted.holdReference,
              advanceSeconds: scenario.advanceSeconds,
            });

            expect(
              reportsAfterEachCommand.map(
                (report) => asSoldTo({ report, seat: scenario.seat, booker: scenario.bookerPair.first }).observed,
              ),
              whatWhyHow({
                what: `after the ${scenario.ordering.length} commands ${summarise(scenario.ordering)} the seat read ${summarise(reportsAfterEachCommand)} instead of staying sold to ${scenario.bookerPair.first} after every single one of them.`,
                why: "One seat is never sold twice and never taken back: once a booker owns it, no later request and no amount of time may give it to anybody else or set it free.",
                how: "Treat a sold seat as final in every command path: refuse every hold and every confirmation on it, and never apply a deadline to it.",
              }),
            ).toEqual(
              scenario.ordering.map(
                () =>
                  asSoldTo({
                    report: { seatId: String(scenario.seat), status: "sold", owner: String(scenario.bookerPair.first) },
                    seat: scenario.seat,
                    booker: scenario.bookerPair.first,
                  }).promised,
              ),
            );
          } finally {
            await service.stop();
          }
        },
      ),
      { numRuns: 8 },
    );
  });

  it("a confirmation with a reference the seating service never granted is refused and tells a stranger nothing [law-wire-shape]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({ service, seat: theChosenSeat, booker: bookers[0] });
      const seatingAreaBefore = await theSeatingAreaNow({ service });
      const aReferenceNobodyWasGiven = randomUUID();

      const outcome = await whenTheHolderConfirmsTheSeat({
        service,
        seat: theChosenSeat,
        holdReference: aReferenceNobodyWasGiven,
      });

      const stimulus = `confirming seat ${theChosenSeat} with a reference the seating service never granted`;
      const refused = refusedCommand({ outcome, stimulus, expectedReason: "no-such-hold" });
      thenTheRefusalSays({
        refused,
        stimulus,
        expectedStatus: 404,
        expectedReason: "no-such-hold",
        why: "A stranger must not be able to learn whether a reference they guessed exists, or they could search for somebody else's hold.",
        how: 'Answer a confirmation with an unknown reference with HTTP 404 and the reason code "no-such-hold", exactly as for a reference that belongs to another hold.',
      });
      thenNoAnswerCarriesTheHoldReference({
        bodies: [refused.rawBody],
        holdReference: granted.holdReference,
        stimulus: "the refusal of a confirmation with an unknown reference",
      });
      thenTheSeatingAreaIsUnchanged({
        before: seatingAreaBefore,
        after: await theSeatingAreaNow({ service }),
        stimulus: "a confirmation with a reference the seating service never granted",
      });
    } finally {
      await service.stop();
    }
  });

  it.each(holdReferencesTheWireCannotRead)(
    "a confirmation carrying $description is refused, names the field that failed and leaves the seating area untouched [law-wire-shape W-case-invalid-holdref]",
    async (unreadable: AHoldReferenceTheWireCannotRead) => {
      const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
      try {
        await givenTheClockHasMovedOn({ service, seconds: 1 });
        const granted = await givenTheBookerHoldsTheSeat({ service, seat: theChosenSeat, booker: bookers[0] });
        const seatingAreaBefore = await theSeatingAreaNow({ service });

        const outcome = await whenTheHolderConfirmsTheSeat({
          service,
          seat: theChosenSeat,
          holdReference: unreadable.holdReference,
        });

        const stimulus = `confirming seat ${theChosenSeat} with ${unreadable.description}`;
        const refused = refusedCommand({ outcome, stimulus, expectedReason: "invalid-request" });
        expect(
          {
            statusCode: refused.statusCode,
            reasonCode: refused.reasonCode,
            carriesAHumanMessage: refused.message.length > 0,
            namesTheField: refused.rawBody.includes("holdRef"),
          },
          whatWhyHow({
            what: `${stimulus} answered ${summarise(refused)} instead of a refusal naming the field that failed.`,
            why: "A hold reference is an opaque value only the seating service issues, so a path that cannot carry one is a malformed request, and the caller can repair it only when the answer says which field was wrong.",
            how: 'Parse the hold reference of the path against its schema before anything else, and refuse a value that is not a UUID with HTTP 400, the reason code "invalid-request", a human message and the path of the field that failed.',
          }),
        ).toEqual({ statusCode: 400, reasonCode: "invalid-request", carriesAHumanMessage: true, namesTheField: true });
        thenNoAnswerCarriesTheHoldReference({
          bodies: [refused.rawBody],
          holdReference: granted.holdReference,
          stimulus: `the refusal of ${stimulus}`,
        });
        thenTheSeatingAreaIsUnchanged({
          before: seatingAreaBefore,
          after: await theSeatingAreaNow({ service }),
          stimulus,
        });
      } finally {
        await service.stop();
      }
    },
  );

  it("a confirmation for a seat the seating area does not have is refused and names the seat that was asked for [law-wire-shape]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      const outcome = await whenTheHolderConfirmsTheSeat({
        service,
        seat: aSeatThatWasNeverConfigured,
        holdReference: randomUUID(),
      });

      const stimulus = `confirming the seat ${aSeatThatWasNeverConfigured}, which the seating area does not have`;
      const refused = refusedCommand({ outcome, stimulus, expectedReason: "no-such-seat" });
      thenTheRefusalSays({
        refused,
        stimulus,
        expectedStatus: 404,
        expectedReason: "no-such-seat",
        why: "A caller who names a seat that is not in the fixed seating area must be able to repair the request without reading the source.",
        how: 'Answer an unknown seat with HTTP 404, the reason code "no-such-seat" and the identifier that was sent.',
      });
      expect(
        refused.rawBody.includes(String(aSeatThatWasNeverConfigured)),
        whatWhyHow({
          what: `the refusal ${summarise(refused)} does not name the seat ${aSeatThatWasNeverConfigured} that was asked for.`,
          why: "A client that sent the wrong identifier can only correct it when the answer repeats the identifier it refused.",
          how: "Carry the seat identifier that was sent in the message of the refusal.",
        }),
      ).toBe(true);
    } finally {
      await service.stop();
    }
  });

  it("a second confirmation of a seat that is already sold is refused and the owner keeps it [law-wire-shape]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({ service, seat: theChosenSeat, booker: bookers[0] });
      confirmedSale({
        outcome: await whenTheHolderConfirmsTheSeat({
          service,
          seat: theChosenSeat,
          holdReference: granted.holdReference,
        }),
        stimulus: `booker ${bookers[0]} confirming seat ${theChosenSeat} while they hold it`,
      });

      const outcome = await whenTheHolderConfirmsTheSeat({
        service,
        seat: theChosenSeat,
        holdReference: granted.holdReference,
      });

      const stimulus = `confirming seat ${theChosenSeat} a second time, after it was sold to ${bookers[0]}`;
      thenTheRefusalSays({
        refused: refusedCommand({ outcome, stimulus, expectedReason: "seat-sold" }),
        stimulus,
        expectedStatus: 409,
        expectedReason: "seat-sold",
        why: "A seat that has been bought is no longer a hold anybody can act on, and the answer must say that it is sold rather than hide it behind an unknown reference.",
        how: 'Refuse every command on a sold seat with HTTP 409 and the reason code "seat-sold".',
      });
      thenTheSeatIsReportedSoldTo({
        report: (await theSeatNow({ service, seat: theChosenSeat })).report,
        seat: theChosenSeat,
        booker: bookers[0],
        stimulus: "the seat report taken after the refused second confirmation",
      });
    } finally {
      await service.stop();
    }
  });

  it("a booker who asks for a seat that is already sold is refused and the owner keeps it [law-wire-shape]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({ service, seat: theChosenSeat, booker: bookers[0] });
      confirmedSale({
        outcome: await whenTheHolderConfirmsTheSeat({
          service,
          seat: theChosenSeat,
          holdReference: granted.holdReference,
        }),
        stimulus: `booker ${bookers[0]} confirming seat ${theChosenSeat} while they hold it`,
      });

      const outcome = await whenTheBookerHoldsTheSeat({ service, seat: theChosenSeat, booker: bookers[1] });

      const stimulus = `booker ${bookers[1]} holding seat ${theChosenSeat}, which ${bookers[0]} has bought`;
      thenTheRefusalSays({
        refused: refusedCommand({ outcome, stimulus, expectedReason: "seat-sold" }),
        stimulus,
        expectedStatus: 409,
        expectedReason: "seat-sold",
        why: "A booker who asks for a seat somebody has already bought must learn that it is gone for good, not that it is held until some deadline.",
        how: 'Refuse a hold on a sold seat with HTTP 409 and the reason code "seat-sold".',
      });
      thenTheSeatIsReportedSoldTo({
        report: (await theSeatNow({ service, seat: theChosenSeat })).report,
        seat: theChosenSeat,
        booker: bookers[0],
        stimulus: "the seat report taken after the refused hold",
      });
    } finally {
      await service.stop();
    }
  });

  it("a restart loses the sale and the bought seat cannot be told from a seat nobody ever bought", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    const soldBeforeTheRestart = await (async (): Promise<SeatReport> => {
      try {
        await givenTheClockHasMovedOn({ service, seconds: 1 });
        const granted = await givenTheBookerHoldsTheSeat({ service, seat: theChosenSeat, booker: bookers[0] });
        confirmedSale({
          outcome: await whenTheHolderConfirmsTheSeat({
            service,
            seat: theChosenSeat,
            holdReference: granted.holdReference,
          }),
          stimulus: `booker ${bookers[0]} confirming seat ${theChosenSeat} while they hold it`,
        });
        return (await theSeatNow({ service, seat: theChosenSeat })).report;
      } finally {
        await service.stop();
      }
    })();

    const restarted = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      const theBoughtSeat = (await theSeatNow({ service: restarted, seat: theChosenSeat })).report;
      const aSeatNobodyEverBought = (await theSeatNow({ service: restarted, seat: seatingAreaOfThreeSeats[0] })).report;
      expect(
        { boughtSeat: { ...theBoughtSeat, seatId: "any seat" }, neverBought: { ...aSeatNobodyEverBought, seatId: "any seat" } },
        whatWhyHow({
          what: `after a restart the seat ${theChosenSeat}, which read ${summarise(soldBeforeTheRestart)} before the restart, reads ${summarise(theBoughtSeat)} while a seat nobody ever bought reads ${summarise(aSeatNobodyEverBought)}.`,
          why: "All state lives in one process and nothing survives a restart, so every sale is lost and a reader after a restart genuinely cannot tell a lost sale from a seat that was never bought. This loss is accepted, and it must be complete rather than partial.",
          how: "Load the configured seating area at start with every seat free, and keep no sale and no hold outside the running process.",
        }),
      ).toEqual({
        boughtSeat: { seatId: "any seat", status: "free" },
        neverBought: { seatId: "any seat", status: "free" },
      });
    } finally {
      await restarted.stop();
    }
  });
});
