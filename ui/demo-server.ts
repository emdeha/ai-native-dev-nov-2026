import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const loopbackAddress = "127.0.0.1";
const apiPrefix = "/api";
const pagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "public", "index.html");

export type RunningDemoServer = {
  readonly url: string;
  readonly stop: () => Promise<void>;
};

const bodyOf = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const servePage = async (response: ServerResponse): Promise<void> => {
  const page = await readFile(pagePath);
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(page);
};

const forwardToService = async (options: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly seatServiceUrl: string;
}): Promise<void> => {
  const { request, response, seatServiceUrl } = options;
  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await bodyOf(request);
  const answer = await fetch(`${seatServiceUrl}${(request.url ?? "/").slice(apiPrefix.length)}`, {
    method,
    headers: { "content-type": request.headers["content-type"] ?? "application/json" },
    body,
  });
  response.writeHead(answer.status, {
    "content-type": answer.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store",
  });
  response.end(Buffer.from(await answer.arrayBuffer()));
};

const isApiRequest = (url: string | undefined): boolean =>
  url === apiPrefix || (url ?? "").startsWith(`${apiPrefix}/`);

export const startDemoServer = (options: {
  readonly seatServiceUrl: string;
  readonly port: number;
}): Promise<RunningDemoServer> => {
  const server = createServer((request, response) => {
    const handled = isApiRequest(request.url)
      ? forwardToService({ request, response, seatServiceUrl: options.seatServiceUrl })
      : servePage(response);
    void handled.catch((failure: unknown) => {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(JSON.stringify({ failure: `the seating service could not be reached: ${String(failure)}` }));
    });
  });

  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => {
        resolve();
      });
    });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, loopbackAddress, () => {
      const address = server.address();
      const port = address !== null && typeof address === "object" ? address.port : options.port;
      resolve({ url: `http://${loopbackAddress}:${port}`, stop });
    });
  });
};
