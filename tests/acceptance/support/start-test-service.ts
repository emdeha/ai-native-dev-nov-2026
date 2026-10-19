import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const supportDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(supportDirectory, "..", "..", "..");
const serviceEntry = path.join(repositoryRoot, "src", "main.ts");
const serviceEntryName = path.relative(repositoryRoot, serviceEntry).split(path.sep).join("/");
const readinessBudgetMilliseconds = 10000;

export type SeatingServiceConfiguration = {
  readonly inventory: readonly string[];
  readonly holdDurationSeconds: number;
};

export type RunningSeatingService = {
  readonly tag: "running";
  readonly baseUrl: string;
  readonly configuration: SeatingServiceConfiguration;
  readonly stop: () => Promise<void>;
};

export type UnavailableSeatingService = {
  readonly tag: "unavailable";
  readonly why: string;
  readonly configuration: SeatingServiceConfiguration;
  readonly stop: () => Promise<void>;
};

export type SeatingService = RunningSeatingService | UnavailableSeatingService;

type Cancellation = { cancelled: boolean };

const doNothing = async (): Promise<void> => undefined;

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close(() => {
          reject(new Error("the operating system reported no numeric port for the test service"));
        });
        return;
      }
      const chosen = address.port;
      probe.close(() => {
        resolve(chosen);
      });
    });
  });

const answers = async (baseUrl: string): Promise<boolean> => {
  try {
    await fetch(`${baseUrl}/seats`);
    return true;
  } catch {
    return false;
  }
};

const waitUntilAnswering = async (options: {
  readonly baseUrl: string;
  readonly deadline: number;
  readonly cancellation: Cancellation;
}): Promise<"ready" | "silent"> => {
  if (options.cancellation.cancelled) {
    return "silent";
  }
  if (await answers(options.baseUrl)) {
    return "ready";
  }
  if (Date.now() >= options.deadline) {
    return "silent";
  }
  await delay(25);
  return waitUntilAnswering(options);
};

export const startTestService = async (
  configuration: SeatingServiceConfiguration,
): Promise<SeatingService> => {
  if (!existsSync(serviceEntry)) {
    return {
      tag: "unavailable",
      why: `the seating service has no entry at ${serviceEntryName}, so no seating service was listening`,
      configuration,
      stop: doNothing,
    };
  }

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serviceEntry], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SEAT_INVENTORY: configuration.inventory.join(","),
      HOLD_DURATION_SECONDS: String(configuration.holdDurationSeconds),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => {
    output.push(chunk.toString());
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output.push(chunk.toString());
  });

  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    const exited = new Promise<void>((resolve) => {
      child.once("exit", () => {
        resolve();
      });
    });
    child.kill("SIGKILL");
    await exited;
  };

  const stopped = new Promise<"stopped">((resolve) => {
    child.once("exit", () => {
      resolve("stopped");
    });
  });
  const failedToStart = new Promise<"stopped">((resolve) => {
    child.once("error", () => {
      resolve("stopped");
    });
  });

  const cancellation: Cancellation = { cancelled: false };
  const readiness = await Promise.race([
    waitUntilAnswering({ baseUrl, deadline: Date.now() + readinessBudgetMilliseconds, cancellation }),
    stopped,
    failedToStart,
  ]);
  cancellation.cancelled = true;

  if (readiness === "ready") {
    return { tag: "running", baseUrl, configuration, stop };
  }

  await stop();
  const reported = output.join("").trim();
  const detail = reported === "" ? "it printed nothing" : reported.slice(0, 600);
  const why =
    readiness === "stopped"
      ? `the seating service started from ${serviceEntryName} stopped before it answered on ${baseUrl}: ${detail}`
      : `the seating service started from ${serviceEntryName} never answered on ${baseUrl}: ${detail}`;
  return { tag: "unavailable", why, configuration, stop: doNothing };
};
