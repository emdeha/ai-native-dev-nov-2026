import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";
import { z } from "zod";
import { seatIdSchema, secondsSchema } from "./domain/seat-state.ts";
import { seatService } from "./app/seat-service.ts";
import type { Configuration } from "./app/ports.ts";
import { advanceableClock, uuidHoldReferences } from "./adapter/clock.ts";
import { inMemorySeatStore } from "./adapter/memory/in-memory-seat-store.ts";
import { seatRoutes, type HttpRequest } from "./adapter/http/seat-routes.ts";

const defaultHoldDurationSeconds = 120;
const defaultPort = 8080;
const loopbackAddress = "127.0.0.1";

const environmentSchema = z.object({
  SEAT_INVENTORY: z.string().min(1),
  HOLD_DURATION_SECONDS: z.coerce.number().int().positive().default(defaultHoldDurationSeconds),
  PORT: z.coerce.number().int().nonnegative().default(defaultPort),
});

export type ServiceConfiguration = Configuration & { readonly port: number };

export const configuration = (options: {
  readonly environment: Record<string, string | undefined>;
}): ServiceConfiguration => {
  const parsed = environmentSchema.parse(options.environment);
  return {
    inventory: parsed.SEAT_INVENTORY.split(",").map((seat) => seatIdSchema.parse(seat.trim())),
    holdDurationSeconds: secondsSchema.parse(parsed.HOLD_DURATION_SECONDS),
    port: parsed.PORT,
  };
};

const bodyOf = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const answerWith = (options: {
  readonly response: ServerResponse;
  readonly status: number;
  readonly body: unknown;
}): void => {
  const payload = JSON.stringify(options.body);
  options.response.writeHead(options.status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(payload)),
  });
  options.response.end(payload);
};

const started = configuration({ environment: process.env });
const routes = seatRoutes({
  service: seatService({
    clock: advanceableClock(),
    store: inMemorySeatStore({ inventory: started.inventory }),
    references: uuidHoldReferences(),
    configuration: started,
  }),
});

const asHttpRequest = (options: {
  readonly request: IncomingMessage;
  readonly body: string;
}): HttpRequest => ({
  method: options.request.method ?? "GET",
  path: options.request.url ?? "/",
  body: options.body,
});

const server = createServer((request: IncomingMessage, response: ServerResponse): void => {
  void bodyOf(request)
    .then((body) => {
      const answer = routes(asHttpRequest({ request, body }));
      answerWith({ response, status: answer.status, body: answer.body });
    })
    .catch((failure: unknown) => {
      answerWith({ response, status: 500, body: { failure: String(failure) } });
    });
});

server.listen(started.port, loopbackAddress);
