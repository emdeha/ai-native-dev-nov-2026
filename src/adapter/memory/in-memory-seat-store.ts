import { free, type SeatId, type SeatState } from "../../domain/seat-state.ts";
import type { SeatLookup, SeatStore } from "../../app/ports.ts";

export const inMemorySeatStore = (options: { readonly inventory: readonly SeatId[] }): SeatStore => {
  let records: ReadonlyMap<SeatId, SeatState> = new Map(
    options.inventory.map((seatId) => [seatId, free]),
  );

  const read = (request: { readonly seatId: SeatId }): SeatLookup => {
    const stored = records.get(request.seatId);
    return stored === undefined ? { tag: "no-such-seat" } : { tag: "stored", state: stored };
  };

  const write = (request: { readonly seatId: SeatId; readonly state: SeatState }): void => {
    records = records.has(request.seatId)
      ? new Map(records).set(request.seatId, request.state)
      : records;
  };

  return { read, write };
};
