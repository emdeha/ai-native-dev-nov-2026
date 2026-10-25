import { describe, expect, it } from "vitest";
import { startDemoServer } from "../../ui/demo-server.ts";
import { startTestService, type SeatingServiceConfiguration } from "../acceptance/support/start-test-service";

const aSmallSeatingArea: SeatingServiceConfiguration = {
  inventory: ["A1", "A2", "A3"],
  holdDurationSeconds: 120,
};

const withDemo = async (
  exercise: (demo: { readonly url: string; readonly serviceUrl: string }) => Promise<void>,
): Promise<void> => {
  const service = await startTestService(aSmallSeatingArea);
  if (service.tag !== "running") {
    throw new Error(service.why);
  }
  const demo = await startDemoServer({ seatServiceUrl: service.baseUrl, port: 0 });
  try {
    await exercise({ url: demo.url, serviceUrl: service.baseUrl });
  } finally {
    await demo.stop();
    await service.stop();
  }
};

const holdOf = (options: { readonly url: string; readonly seatId: string; readonly body: string }): Promise<Response> =>
  fetch(`${options.url}/api/seats/${options.seatId}/holds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: options.body,
  });

describe("The seat demo UI shows the seating service as it is", () => {
  it("serves the seat picker page", async () => {
    await withDemo(async ({ url }) => {
      const page = await fetch(`${url}/`);

      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(await page.text()).toContain("Last Seat");
    });
  });

  it("shows the live seating area the service reports", async () => {
    await withDemo(async ({ url, serviceUrl }) => {
      await holdOf({ url: serviceUrl, seatId: "A2", body: JSON.stringify({ booker: "Ana" }) });

      const seats = await fetch(`${url}/api/seats`);

      expect(seats.status).toBe(200);
      expect(await seats.json()).toEqual(await (await fetch(`${serviceUrl}/seats`)).json());
    });
  });

  it("passes a granted hold through to the browser", async () => {
    await withDemo(async ({ url }) => {
      const granted = await holdOf({ url, seatId: "A1", body: JSON.stringify({ booker: "Ana" }) });

      expect(granted.status).toBe(201);
      expect(await granted.json()).toMatchObject({ holdRef: expect.any(String), deadline: expect.any(Number) });
    });
  });

  it("passes the service's refusal through unchanged, with no validation of its own", async () => {
    await withDemo(async ({ url }) => {
      const refused = await holdOf({ url, seatId: "A1", body: JSON.stringify({ booker: "" }) });

      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ reason: "invalid-request" });
    });
  });

  it("passes a refusal for a seat another booker holds through unchanged", async () => {
    await withDemo(async ({ url }) => {
      await holdOf({ url, seatId: "A3", body: JSON.stringify({ booker: "Ana" }) });

      const refused = await holdOf({ url, seatId: "A3", body: JSON.stringify({ booker: "Ben" }) });

      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ reason: "seat-held" });
    });
  });
});
