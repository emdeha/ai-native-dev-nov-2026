import { randomUUID } from "node:crypto";
import { holdRef, seconds, type Seconds } from "../domain/seat-state.ts";
import type { Clock, HoldReferences } from "../app/ports.ts";

const millisecondsPerSecond = 1000;

export const advanceableClock = (): Clock => {
  const seededAt = Math.floor(Date.now() / millisecondsPerSecond);
  let offsetSeconds = 0;

  const now = (): Seconds => seconds(seededAt + offsetSeconds);

  const advanceBy = (options: { readonly seconds: Seconds }): Seconds => {
    offsetSeconds = offsetSeconds + options.seconds;
    return now();
  };

  return { now, advanceBy };
};

export const uuidHoldReferences = (): HoldReferences => ({
  next: () => holdRef(randomUUID()),
});
