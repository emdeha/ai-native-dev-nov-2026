import { randomUUID } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  advanceClock,
  bookerName,
  cancelHold,
  confirmHold,
  holdSeat,
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
  type ReleasedSeat,
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
const theSeatThatIsHeldAgainAndAgain = seatId("s12");
const theSeatThatGetsBought = seatId("s11");
const theOtherSeat = seatId("s13");
const bookers = [bookerName("A"), bookerName("B"), bookerName("C")];
const theFirstBooker = bookers[0];
const theNextBooker = bookers[1];
const twoMinutes = 120;
const anHour = 3600;
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
      why: "A hold can only be shown to end if a booker was given one first, and only the reference that hold hands back can give it up again.",
      how: 'Answer a hold on a free seat with HTTP 201 and a JSON body {"holdRef": <opaque reference>, "deadline": <whole seconds>}.',
    }),
  ).toBe("a granted hold carrying a hold reference and a deadline");
  return { tag: "granted", holdReference: "", deadlineSeconds: Number.NaN, rawBody: "" };
};

const releasedSeat = (options: { readonly outcome: CancelOutcome; readonly stimulus: string }): ReleasedSeat => {
  if (options.outcome.tag === "released") {
    return options.outcome;
  }
  expect(
    summarise(options.outcome),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.outcome)} instead of the seat reported free again.`,
      why: "A booker who no longer wants the seat must be able to give it back at once, and must see from the answer that the seat is free again.",
      how: 'Answer a cancellation sent by the holder before the deadline with HTTP 200 and the report of that seat as free: {"seatId": <identifier>, "status": "free"}.',
    }),
  ).toBe("the seat reported free again");
  return { tag: "released", report: { seatId: "", status: "held" }, rawBody: "" };
};

const confirmedSale = (options: { readonly outcome: ConfirmOutcome; readonly stimulus: string }): ConfirmedSale => {
  if (options.outcome.tag === "confirmed") {
    return options.outcome;
  }
  expect(
    summarise(options.outcome),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.outcome)} instead of the seat sold to the booker who was holding it.`,
      why: "A seat can only be shown to survive every later wait once a booker has actually bought it.",
      how: 'Answer a confirmation sent by the holder before the deadline with HTTP 200 and the report of that seat as sold: {"seatId": <identifier>, "status": "sold", "owner": <booker name>}.',
    }),
  ).toBe("the seat sold to the booker who was holding it");
  return { tag: "confirmed", report: { seatId: "", status: "free" }, rawBody: "" };
};

const refusedCommand = (options: {
  readonly outcome: CancelOutcome | ConfirmOutcome | HoldOutcome;
  readonly stimulus: string;
  readonly expected: string;
}): RefusedCommand => {
  if (options.outcome.tag === "refused") {
    return options.outcome;
  }
  expect(
    summarise(options.outcome),
    whatWhyHow({
      what: `${options.stimulus} answered ${summarise(options.outcome)} instead of ${options.expected}.`,
      why: "A request that would take a seat from the booker it belongs to must be refused in a way the client can act on, never answered as a success.",
      how: 'Answer this request with the refusal status the seating service promises and a JSON body {"reason": <machine reason code>, "message": <human message>}.',
    }),
  ).toBe(options.expected);
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
      why: "Whether a hold has ended can only be seen in the report of the seat, so a missing or unreadable answer hides the very thing this promise is about.",
      how: 'Answer a seat with HTTP 200 and a JSON body {"seatId": <identifier>, "status": "free" | "held" | "sold", ...}.',
    }),
  ).toBe("the report of that seat");
  return { tag: "reported", report: { seatId: "", status: "held" }, rawBody: "" };
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
      why: "Whether every hold was released and every sale kept can only be judged from the report of every configured seat at once.",
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
      why: "A hold is released when the time the service reports reaches its deadline, so that time must be readable before any waiting can be judged.",
      how: 'Answer the demonstration clock with HTTP 200 and a JSON body carrying {"now": <whole seconds>} after the clock has moved.',
    }),
  ).toBe("the time the seating service is using");
  return Number.NaN;
};

const asComparableReport = (report: SeatReport) => ({
  seatId: report.seatId,
  status: report.status,
  holder: report.holder ?? null,
  deadline: report.deadline ?? null,
  owner: report.owner ?? null,
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

const givenTheBookerHoldsTheSeat = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
}): Promise<GrantedHold> =>
  grantedHold({
    outcome: await holdSeat({ service: options.service, seat: options.seat, booker: options.booker }),
    stimulus: `booker ${options.booker} holding the free seat ${options.seat}`,
  });

const givenTheBookerHasBoughtTheSeat = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
}): Promise<GrantedHold> => {
  const granted = await givenTheBookerHoldsTheSeat(options);
  confirmedSale({
    outcome: await confirmHold({
      service: options.service,
      seat: options.seat,
      holdReference: granted.holdReference,
    }),
    stimulus: `booker ${options.booker} buying seat ${options.seat} while they are holding it`,
  });
  return granted;
};

const theSeatNow = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly moment: string;
}): Promise<ReportedSeat> =>
  reportedSeat({
    observation: await seatReport({ service: options.service, seat: options.seat }),
    stimulus: `reading seat ${options.seat} ${options.moment}`,
  });

const theSeatingAreaNow = async (options: { readonly service: SeatingService }): Promise<ReportedSeatingArea> =>
  reportedSeatingArea({
    observation: await seatingArea({ service: options.service }),
    stimulus: "reading the whole seating area",
  });

const whenTheHolderGivesTheSeatUp = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly holdReference: string;
}): Promise<CancelOutcome> =>
  cancelHold({ service: options.service, seat: options.seat, holdReference: options.holdReference });

const whenTheBookerAsksForTheSeat = async (options: {
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

const thenTheSeatIsReportedFree = (options: {
  readonly report: SeatReport;
  readonly seat: SeatId;
  readonly moment: string;
  readonly why: string;
  readonly how: string;
}): void => {
  expect(
    asComparableReport(options.report),
    whatWhyHow({
      what: `${options.moment} seat ${options.seat} reads ${summarise(options.report)} instead of free, with nobody holding it, no deadline on it and no owner.`,
      why: options.why,
      how: options.how,
    }),
  ).toEqual({ seatId: String(options.seat), status: "free", holder: null, deadline: null, owner: null });
};

const thenTheSeatIsReportedHeldFor = (options: {
  readonly report: SeatReport;
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly deadlineSeconds: number;
  readonly moment: string;
  readonly why: string;
  readonly how: string;
}): void => {
  expect(
    asComparableReport(options.report),
    whatWhyHow({
      what: `${options.moment} seat ${options.seat} reads ${summarise(options.report)} instead of held for ${options.booker} until ${options.deadlineSeconds}.`,
      why: options.why,
      how: options.how,
    }),
  ).toEqual({
    seatId: String(options.seat),
    status: "held",
    holder: String(options.booker),
    deadline: options.deadlineSeconds,
    owner: null,
  });
};

const thenTheSeatIsReportedSoldTo = (options: {
  readonly report: SeatReport;
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly moment: string;
}): void => {
  expect(
    asComparableReport(options.report),
    whatWhyHow({
      what: `${options.moment} seat ${options.seat} reads ${summarise(options.report)} instead of sold to ${options.booker}, with no holder and no deadline on it.`,
      why: "A seat that has been bought is never released: however long the booker waits before coming to the event, time passing must not hand their seat to somebody else.",
      how: "Keep no deadline on a sold seat and apply the expiry comparison only to seats that are still held, so no amount of waiting can free a sale.",
    }),
  ).toEqual({
    seatId: String(options.seat),
    status: "sold",
    holder: null,
    deadline: null,
    owner: String(options.booker),
  });
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

const thenTheSeatingAreaReadsExactlyAsBefore = (options: {
  readonly before: ReportedSeatingArea;
  readonly after: ReportedSeatingArea;
  readonly stimulus: string;
}): void => {
  expect(
    options.after.rawBody,
    whatWhyHow({
      what: `after ${options.stimulus} the seating area answers ${options.after.rawBody} instead of ${options.before.rawBody}, which is what it answered before.`,
      why: "A refused request must leave the seating area exactly as it was, so that being refused can never quietly release, take or lengthen a hold.",
      how: "Decide every refusal before anything is written, and write nothing at all on the refusing path.",
    }),
  ).toBe(options.before.rawBody);
};

const thenTheFreedSeatIsGrantedTo = async (options: {
  readonly service: SeatingService;
  readonly seat: SeatId;
  readonly booker: BookerName;
  readonly expectedDeadlineSeconds: number;
  readonly spentReference: string;
  readonly stimulus: string;
}): Promise<void> => {
  const outcome = await whenTheBookerAsksForTheSeat({
    service: options.service,
    seat: options.seat,
    booker: options.booker,
  });
  const granted = grantedHold({
    outcome,
    stimulus: `booker ${options.booker} asking for seat ${options.seat} ${options.stimulus}`,
  });
  expect(
    { deadline: granted.deadlineSeconds, reusesTheOldReference: granted.holdReference === options.spentReference },
    whatWhyHow({
      what: `booker ${options.booker} asking for seat ${options.seat} ${options.stimulus} received ${summarise(granted)} instead of a hold of their own until ${options.expectedDeadlineSeconds}.`,
      why: "A released seat goes to whoever asks first, and the booker who takes it must get the full hold duration and a reference of their own, not the leftovers of the hold that ended.",
      how: "Treat a released seat exactly like a seat nobody ever held: grant the hold, set the deadline to the time of this grant plus the configured hold duration, and issue a fresh hold reference.",
    }),
  ).toEqual({ deadline: options.expectedDeadlineSeconds, reusesTheOldReference: false });
};

describe("Every hold is released", () => {
  it("the holder gives the seat up and the next booker takes it straight away", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theFirstBooker,
      });
      const timeOfTheCancellation = await givenTheClockHasMovedOn({ service, seconds: 10 });

      const outcome = await whenTheHolderGivesTheSeatUp({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        holdReference: granted.holdReference,
      });

      const released = releasedSeat({
        outcome,
        stimulus: `booker ${theFirstBooker} giving seat ${theSeatThatIsHeldAgainAndAgain} up well before the deadline ${granted.deadlineSeconds}`,
      });
      thenTheSeatIsReportedFree({
        report: released.report,
        seat: theSeatThatIsHeldAgainAndAgain,
        moment: "in the answer to the cancellation",
        why: "The booker who gives a seat up learns from that very answer that the seat is no longer theirs and is free again for somebody else.",
        how: 'Answer the holder\'s cancellation with HTTP 200 and the report of that seat as free: {"seatId": <identifier>, "status": "free"}.',
      });
      thenTheSeatIsReportedFree({
        report: (
          await theSeatNow({
            service,
            seat: theSeatThatIsHeldAgainAndAgain,
            moment: "right after the holder gave it up",
          })
        ).report,
        seat: theSeatThatIsHeldAgainAndAgain,
        moment: "right after the holder gave it up",
        why: "Giving a seat up releases it at once and not only at the deadline, so an unwanted seat goes back on sale while the event can still fill it.",
        how: "Remove the hold on the cancelling path and report the seat from the same projection every other reader uses.",
      });
      await thenTheFreedSeatIsGrantedTo({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theNextBooker,
        expectedDeadlineSeconds: timeOfTheCancellation + twoMinutes,
        spentReference: granted.holdReference,
        stimulus: "right after the booker before them gave it up",
      });
    } finally {
      await service.stop();
    }
  });

  it("nobody acts and the seat is free the second its deadline is reached [law-every-hold-is-released] [m6-holds-never-expire]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theFirstBooker,
      });

      const theDeadlineSecond = await givenTheClockHasMovedOn({ service, seconds: twoMinutes });

      expect(
        theDeadlineSecond,
        whatWhyHow({
          what: `waiting out the whole hold left the seating service reporting ${theDeadlineSecond} instead of the deadline second ${granted.deadlineSeconds} of the hold that was granted.`,
          why: "This scenario is about the exact second the hold runs out, so the demonstration clock must stand on that second and on no other.",
          how: "Move the clock by exactly the seconds the demonstration operation was given, and count the deadline of a hold in the same whole seconds.",
        }),
      ).toBe(granted.deadlineSeconds);
      thenTheSeatIsReportedFree({
        report: (
          await theSeatNow({
            service,
            seat: theSeatThatIsHeldAgainAndAgain,
            moment: "on the deadline second of a hold nobody confirmed",
          })
        ).report,
        seat: theSeatThatIsHeldAgainAndAgain,
        moment: "on the deadline second of a hold nobody confirmed",
        why: "A hold that nobody confirms must release the seat by itself the moment its deadline is reached, or an abandoned seat stays blocked for ever and the event sells one seat fewer.",
        how: "Compare the hold deadline with the current time on every read, and report a seat whose deadline the time has reached as free, with no grace second.",
      });
      await thenTheFreedSeatIsGrantedTo({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theFirstBooker,
        expectedDeadlineSeconds: theDeadlineSecond + twoMinutes,
        spentReference: granted.holdReference,
        stimulus: "after their own earlier hold ran out",
      });
    } finally {
      await service.stop();
    }
  });

  it("the reference of a hold that ran out buys nothing afterwards [law-deadline-is-authoritative]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theFirstBooker,
      });
      await givenTheClockHasMovedOn({ service, seconds: twoMinutes });
      const theSeatBeforeTheLateConfirmation = await theSeatingAreaNow({ service });

      const outcome = await whenTheBookerConfirmsWithTheReference({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        holdReference: granted.holdReference,
      });

      const lateConfirmation = `booker ${theFirstBooker} confirming seat ${theSeatThatIsHeldAgainAndAgain} with their own reference on the deadline second ${granted.deadlineSeconds}`;
      thenTheRefusalSays({
        refused: refusedCommand({
          outcome,
          stimulus: lateConfirmation,
          expected: 'a refusal saying the hold expired',
        }),
        stimulus: lateConfirmation,
        expectedStatus: 409,
        expectedReason: "hold-expired",
        why: "Once the hold is released the seat belongs to nobody, so the reference that hold handed out must buy nothing, or a released seat could still be taken from the booker who took it next.",
        how: 'Refuse a confirmation that arrives at or after the deadline of the hold it names with HTTP 409 and the reason code "hold-expired".',
      });
      thenTheSeatingAreaReadsExactlyAsBefore({
        before: theSeatBeforeTheLateConfirmation,
        after: await theSeatingAreaNow({ service }),
        stimulus: "a confirmation arriving with the reference of a hold that had already run out",
      });
    } finally {
      await service.stop();
    }
  });

  it("a cancellation that arrives after the deadline is refused and the seat stays free for everybody", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theFirstBooker,
      });
      await givenTheClockHasMovedOn({ service, seconds: twoMinutes + 5 });
      const theSeatingAreaAfterTheHoldRanOut = await theSeatingAreaNow({ service });

      const outcome = await whenTheHolderGivesTheSeatUp({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        holdReference: granted.holdReference,
      });

      const lateCancellation = `booker ${theFirstBooker} giving seat ${theSeatThatIsHeldAgainAndAgain} up five seconds after the deadline ${granted.deadlineSeconds} of their hold`;
      thenTheRefusalSays({
        refused: refusedCommand({
          outcome,
          stimulus: lateCancellation,
          expected: 'a refusal saying the hold expired',
        }),
        stimulus: lateCancellation,
        expectedStatus: 409,
        expectedReason: "hold-expired",
        why: "A booker who gives up a hold that already ran out must be told that it ended by itself, instead of being allowed to act on a seat that may already belong to somebody else.",
        how: 'Refuse a cancellation that arrives at or after the deadline of the hold it names with HTTP 409 and the reason code "hold-expired", exactly as a late confirmation is refused.',
      });
      thenTheSeatingAreaReadsExactlyAsBefore({
        before: theSeatingAreaAfterTheHoldRanOut,
        after: await theSeatingAreaNow({ service }),
        stimulus: "a cancellation arriving after the hold it named had already run out",
      });
    } finally {
      await service.stop();
    }
  });

  it("a cancellation that does not carry the hold's own reference takes the seat from nobody [m3-cancel-ignores-reference]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theFirstBooker,
      });
      const heldElsewhere = await givenTheBookerHoldsTheSeat({
        service,
        seat: theOtherSeat,
        booker: theNextBooker,
      });
      const theSeatingAreaBeforeTheAttempts = await theSeatingAreaNow({ service });

      const outcome = await whenTheHolderGivesTheSeatUp({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        holdReference: heldElsewhere.holdReference,
      });

      const cancellationWithSomebodyElsesReference = `booker ${theNextBooker} giving seat ${theSeatThatIsHeldAgainAndAgain} up with the reference of their own hold on another seat`;
      thenTheRefusalSays({
        refused: refusedCommand({
          outcome,
          stimulus: cancellationWithSomebodyElsesReference,
          expected: "a refusal saying there is no such hold",
        }),
        stimulus: cancellationWithSomebodyElsesReference,
        expectedStatus: 404,
        expectedReason: "no-such-hold",
        why: "Only the booker holding a seat may give it up, or anybody could release the seat somebody else is holding and take it for themselves.",
        how: 'Refuse a cancellation whose reference is not the reference of the hold on that seat with HTTP 404 and the reason code "no-such-hold".',
      });
      const cancellationWithAReferenceNobodyWasGiven = `a stranger giving seat ${theSeatThatIsHeldAgainAndAgain} up with a reference the seating service never granted`;
      thenTheRefusalSays({
        refused: refusedCommand({
          outcome: await whenTheHolderGivesTheSeatUp({
            service,
            seat: theSeatThatIsHeldAgainAndAgain,
            holdReference: randomUUID(),
          }),
          stimulus: cancellationWithAReferenceNobodyWasGiven,
          expected: "a refusal saying there is no such hold",
        }),
        stimulus: cancellationWithAReferenceNobodyWasGiven,
        expectedStatus: 404,
        expectedReason: "no-such-hold",
        why: "A stranger who guesses references must learn nothing and release nothing, or every held seat could be freed by trying long enough.",
        how: 'Refuse a cancellation carrying a reference that was never granted with HTTP 404 and the reason code "no-such-hold", and answer it exactly as a wrong reference is answered.',
      });
      thenTheSeatIsReportedHeldFor({
        report: (
          await theSeatNow({
            service,
            seat: theSeatThatIsHeldAgainAndAgain,
            moment: "after two cancellations that carried the wrong reference",
          })
        ).report,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theFirstBooker,
        deadlineSeconds: granted.deadlineSeconds,
        moment: "after two cancellations that carried the wrong reference",
        why: "A hold ends when its own holder gives it up or when its deadline passes, and never because somebody else asked, so the holder keeps the seat and keeps the same deadline.",
        how: "Compare the presented reference with the reference of the hold on that seat before anything is written, and leave the hold untouched when they differ.",
      });
      thenTheSeatingAreaReadsExactlyAsBefore({
        before: theSeatingAreaBeforeTheAttempts,
        after: await theSeatingAreaNow({ service }),
        stimulus: "two cancellations that carried a reference other than the one the hold was granted with",
      });
    } finally {
      await service.stop();
    }
  });

  it("a refused second hold never lengthens the hold it was refused [m7-hold-renews-existing-hold]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHoldsTheSeat({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theFirstBooker,
      });
      await givenTheClockHasMovedOn({ service, seconds: twoMinutes / 2 });
      refusedCommand({
        outcome: await whenTheBookerAsksForTheSeat({
          service,
          seat: theSeatThatIsHeldAgainAndAgain,
          booker: theNextBooker,
        }),
        stimulus: `booker ${theNextBooker} asking halfway through the hold for seat ${theSeatThatIsHeldAgainAndAgain}, which ${theFirstBooker} is holding`,
        expected: "a refusal saying the seat is held",
      });

      const theDeadlineSecondOfTheFirstHold = await givenTheClockHasMovedOn({ service, seconds: twoMinutes / 2 });

      expect(
        theDeadlineSecondOfTheFirstHold,
        whatWhyHow({
          what: `waiting out the rest of the hold left the seating service reporting ${theDeadlineSecondOfTheFirstHold} instead of the deadline second ${granted.deadlineSeconds} the first hold was granted with.`,
          why: "This scenario asks what the refused request did to the deadline, so the time must stand exactly on the deadline the first hold was given.",
          how: "Move the clock only by the seconds the demonstration operation was given.",
        }),
      ).toBe(granted.deadlineSeconds);
      thenTheSeatIsReportedFree({
        report: (
          await theSeatNow({
            service,
            seat: theSeatThatIsHeldAgainAndAgain,
            moment: "on the deadline of the hold a second booker was refused",
          })
        ).report,
        seat: theSeatThatIsHeldAgainAndAgain,
        moment: "on the deadline of the hold a second booker was refused",
        why: "A hold cannot be extended or renewed: if a refused request pushed the deadline further out, the seat would stay blocked longer every time somebody asked for it and might never come back.",
        how: "Refuse a hold on a held seat without writing anything at all, and keep the deadline the first hold was granted with.",
      });
      await thenTheFreedSeatIsGrantedTo({
        service,
        seat: theSeatThatIsHeldAgainAndAgain,
        booker: theNextBooker,
        expectedDeadlineSeconds: theDeadlineSecondOfTheFirstHold + twoMinutes,
        spentReference: granted.holdReference,
        stimulus: "once the hold they were refused earlier had run out",
      });
    } finally {
      await service.stop();
    }
  });

  it("a seat that has been bought is never released however long the wait [m4-expiry-releases-sold-seat]", async () => {
    const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: twoMinutes });
    try {
      await givenTheClockHasMovedOn({ service, seconds: 1 });
      const granted = await givenTheBookerHasBoughtTheSeat({
        service,
        seat: theSeatThatGetsBought,
        booker: theFirstBooker,
      });

      await givenTheClockHasMovedOn({ service, seconds: anHour });

      thenTheSeatIsReportedSoldTo({
        report: (
          await theSeatNow({
            service,
            seat: theSeatThatGetsBought,
            moment: "an hour after the deadline the hold behind the sale once had",
          })
        ).report,
        seat: theSeatThatGetsBought,
        booker: theFirstBooker,
        moment: "an hour after the deadline the hold behind the sale once had",
      });
      const theSeatingAreaAfterTheLongWait = await theSeatingAreaNow({ service });
      refusedCommand({
        outcome: await whenTheHolderGivesTheSeatUp({
          service,
          seat: theSeatThatGetsBought,
          holdReference: granted.holdReference,
        }),
        stimulus: `booker ${theFirstBooker} trying to give seat ${theSeatThatGetsBought} up with the reference that already bought it`,
        expected: "a refusal",
      });
      thenTheSeatIsReportedSoldTo({
        report: (
          await theSeatNow({
            service,
            seat: theSeatThatGetsBought,
            moment: "after a cancellation was tried on the seat that was already bought",
          })
        ).report,
        seat: theSeatThatGetsBought,
        booker: theFirstBooker,
        moment: "after a cancellation was tried on the seat that was already bought",
      });
      thenTheSeatingAreaReadsExactlyAsBefore({
        before: theSeatingAreaAfterTheLongWait,
        after: await theSeatingAreaNow({ service }),
        stimulus: "a cancellation tried on a seat that had already been bought",
      });
    } finally {
      await service.stop();
    }
  });

  it("however the clock jumps, every hold ends at its deadline and every sale survives [law-every-hold-is-released] [law-sold-is-absorbing]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(aWalkCommand, { minLength: 2, maxLength: 6 }), async (commands) => {
        const service = await givenAFreeSeatingAreaOfThreeSeats({ holdDurationSeconds: theWalkHoldDuration });
        try {
          const now = await givenTheClockHasMovedOn({ service, seconds: 1 });

          const afterTheCommands = await walkOneCommandAtATime({
            service,
            commands,
            state: { records: noSeatHasAnything, now },
            step: 0,
          });
          const waitedOut = await waitUntilEveryGrantedDeadlineHasPassed({
            service,
            state: afterTheCommands,
          });

          await thenNoHoldOutlastsItsDeadlineAndNoSaleIsReleased({
            service,
            state: waitedOut,
            stimulus: `the walk ${summarise(commands)} followed by a wait long enough for every hold it granted to run out`,
          });
        } finally {
          await service.stop();
        }
      }),
      {
        numRuns: 5,
        examples: [
          [theSecondBookerIsRefusedAndTheFirstHoldStillRunsOut],
          [theClockJumpsFarPastSeveralHoldDurations],
          [aBoughtSeatMeetsALongWait],
          [theHolderGivesOneSeatUpAndLetsAnotherRunOut],
        ],
      },
    );
  });
});

type ReleaseWalkCommand =
  | { readonly kind: "hold"; readonly seat: SeatId; readonly booker: BookerName }
  | { readonly kind: "confirm"; readonly seat: SeatId }
  | { readonly kind: "cancel"; readonly seat: SeatId }
  | { readonly kind: "the clock moves on"; readonly seconds: number };

type SeatRecord =
  | { readonly tag: "nothing is stored" }
  | { readonly tag: "a hold"; readonly booker: BookerName; readonly reference: string; readonly deadline: number }
  | { readonly tag: "a sale"; readonly owner: BookerName };

type WalkState = {
  readonly records: Readonly<Record<string, SeatRecord>>;
  readonly now: number;
};

const noSeatHasAnything: Readonly<Record<string, SeatRecord>> = Object.fromEntries(
  seatingAreaOfThreeSeats.map((seat) => [String(seat), { tag: "nothing is stored" } as const]),
);

const recordOf = (state: WalkState, seat: SeatId): SeatRecord =>
  state.records[String(seat)] ?? { tag: "nothing is stored" };

const withRecord = (options: {
  readonly state: WalkState;
  readonly seat: SeatId;
  readonly record: SeatRecord;
}): WalkState => ({
  ...options.state,
  records: { ...options.state.records, [String(options.seat)]: options.record },
});

const referenceHeldFor = (options: { readonly record: SeatRecord; readonly whenNoneIsHeld: string }): string =>
  options.record.tag === "a hold" ? options.record.reference : options.whenNoneIsHeld;

const recordAfterOneCommand = async (options: {
  readonly service: SeatingService;
  readonly command: ReleaseWalkCommand;
  readonly state: WalkState;
}): Promise<WalkState> => {
  const command = options.command;
  if (command.kind === "the clock moves on") {
    return {
      ...options.state,
      now: await givenTheClockHasMovedOn({ service: options.service, seconds: command.seconds }),
    };
  }
  const record = recordOf(options.state, command.seat);
  if (command.kind === "hold") {
    const outcome = await whenTheBookerAsksForTheSeat({
      service: options.service,
      seat: command.seat,
      booker: command.booker,
    });
    return outcome.tag === "granted"
      ? withRecord({
          state: options.state,
          seat: command.seat,
          record: {
            tag: "a hold",
            booker: command.booker,
            reference: outcome.holdReference,
            deadline: outcome.deadlineSeconds,
          },
        })
      : options.state;
  }
  const reference = referenceHeldFor({ record, whenNoneIsHeld: randomUUID() });
  if (command.kind === "confirm") {
    const outcome = await whenTheBookerConfirmsWithTheReference({
      service: options.service,
      seat: command.seat,
      holdReference: reference,
    });
    return outcome.tag === "confirmed" && record.tag === "a hold"
      ? withRecord({ state: options.state, seat: command.seat, record: { tag: "a sale", owner: record.booker } })
      : options.state;
  }
  const outcome = await whenTheHolderGivesTheSeatUp({
    service: options.service,
    seat: command.seat,
    holdReference: reference,
  });
  return outcome.tag === "released"
    ? withRecord({ state: options.state, seat: command.seat, record: { tag: "nothing is stored" } })
    : options.state;
};

const walkOneCommandAtATime = async (options: {
  readonly service: SeatingService;
  readonly commands: readonly ReleaseWalkCommand[];
  readonly state: WalkState;
  readonly step: number;
}): Promise<WalkState> => {
  const [command, ...rest] = options.commands;
  if (command === undefined) {
    return options.state;
  }
  const state = await recordAfterOneCommand({ service: options.service, command, state: options.state });
  return walkOneCommandAtATime({ ...options, commands: rest, state, step: options.step + 1 });
};

const waitUntilEveryGrantedDeadlineHasPassed = async (options: {
  readonly service: SeatingService;
  readonly state: WalkState;
}): Promise<WalkState> => {
  const deadlines = seatingAreaOfThreeSeats
    .map((seat) => recordOf(options.state, seat))
    .filter((record) => record.tag === "a hold")
    .map((record) => (record.tag === "a hold" ? record.deadline : options.state.now));
  const furthest = deadlines.reduce((latest, deadline) => Math.max(latest, deadline), options.state.now);
  const secondsToWait = Math.max(1, furthest - options.state.now);
  return {
    ...options.state,
    now: await givenTheClockHasMovedOn({ service: options.service, seconds: secondsToWait }),
  };
};

const thenNoHoldOutlastsItsDeadlineAndNoSaleIsReleased = async (options: {
  readonly service: SeatingService;
  readonly state: WalkState;
  readonly stimulus: string;
}): Promise<void> => {
  const reported = await theSeatingAreaNow({ service: options.service });
  const byIdentifier = Object.fromEntries(reported.seats.map((report) => [report.seatId, report]));
  const judged = seatingAreaOfThreeSeats.map((seat) => {
    const record = recordOf(options.state, seat);
    const report = byIdentifier[String(seat)];
    const status = report === undefined ? "not reported at all" : report.status;
    const owner = report?.owner ?? null;
    if (record.tag === "a sale") {
      return { seat: String(seat), observed: { status, owner }, promised: { status: "sold", owner: String(record.owner) } };
    }
    if (record.tag === "a hold" && options.state.now >= record.deadline) {
      return { seat: String(seat), observed: { status, owner }, promised: { status: "free", owner: null } };
    }
    return { seat: String(seat), observed: { status, owner }, promised: { status, owner } };
  });
  expect(
    judged.map((seat) => ({ seat: seat.seat, ...seat.observed })),
    whatWhyHow({
      what: `after ${options.stimulus} the three configured seats read ${summarise(judged.map((seat) => ({ seat: seat.seat, ...seat.observed })))} instead of ${summarise(judged.map((seat) => ({ seat: seat.seat, ...seat.promised })))}.`,
      why: "Every hold is eventually released and every sale is final: once the time has reached the deadline a hold was granted with, that seat must be back on sale for anybody, while a seat somebody bought must still be theirs however far the clock has moved.",
      how: "Release a hold by comparing its deadline with the current time on every read, and carry no deadline on a sold seat so the same comparison can never free a sale.",
    }),
  ).toEqual(judged.map((seat) => ({ seat: seat.seat, ...seat.promised })));
};

const aSeatOfTheArea = fc.constantFrom(...seatingAreaOfThreeSeats);
const aBooker = fc.constantFrom(...bookers);
const aWalkCommand = fc.oneof(
  { arbitrary: fc.record({ kind: fc.constant("hold" as const), seat: aSeatOfTheArea, booker: aBooker }), weight: 4 },
  { arbitrary: fc.record({ kind: fc.constant("cancel" as const), seat: aSeatOfTheArea }), weight: 2 },
  { arbitrary: fc.record({ kind: fc.constant("confirm" as const), seat: aSeatOfTheArea }), weight: 2 },
  {
    arbitrary: fc.record({
      kind: fc.constant("the clock moves on" as const),
      seconds: fc.oneof(
        { arbitrary: fc.integer({ min: 1, max: theWalkHoldDuration }), weight: 3 },
        { arbitrary: fc.integer({ min: 1, max: 300 }), weight: 1 },
      ),
    }),
    weight: 3,
  },
);

const holdOf = (seat: SeatId, booker: BookerName): ReleaseWalkCommand => ({ kind: "hold", seat, booker });
const confirmOf = (seat: SeatId): ReleaseWalkCommand => ({ kind: "confirm", seat });
const cancelOf = (seat: SeatId): ReleaseWalkCommand => ({ kind: "cancel", seat });
const clockMovesOn = (seconds: number): ReleaseWalkCommand => ({ kind: "the clock moves on", seconds });

const theSecondBookerIsRefusedAndTheFirstHoldStillRunsOut: readonly ReleaseWalkCommand[] = [
  holdOf(theSeatThatIsHeldAgainAndAgain, theFirstBooker),
  clockMovesOn(theWalkHoldDuration - 1),
  holdOf(theSeatThatIsHeldAgainAndAgain, theNextBooker),
];

const theClockJumpsFarPastSeveralHoldDurations: readonly ReleaseWalkCommand[] = [
  holdOf(theSeatThatIsHeldAgainAndAgain, theFirstBooker),
  holdOf(theOtherSeat, theNextBooker),
  clockMovesOn(300),
];

const aBoughtSeatMeetsALongWait: readonly ReleaseWalkCommand[] = [
  holdOf(theSeatThatGetsBought, theFirstBooker),
  confirmOf(theSeatThatGetsBought),
  clockMovesOn(300),
  holdOf(theSeatThatGetsBought, theNextBooker),
];

const theHolderGivesOneSeatUpAndLetsAnotherRunOut: readonly ReleaseWalkCommand[] = [
  holdOf(theSeatThatIsHeldAgainAndAgain, theFirstBooker),
  holdOf(theOtherSeat, theFirstBooker),
  cancelOf(theSeatThatIsHeldAgainAndAgain),
  holdOf(theSeatThatIsHeldAgainAndAgain, theNextBooker),
];
