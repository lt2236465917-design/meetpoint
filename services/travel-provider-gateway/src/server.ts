import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import type { GatewayErrorBody, GatewayErrorCode, GatewaySearchResponse } from "./contracts.js";
import { createTravelSearchService, GatewayServiceError, type TravelSearchService } from "./service.js";

const MAX_BODY_BYTES = 16 * 1_024;
const STATUS_BY_CODE: Record<GatewayErrorCode, number> = {
  UNAUTHORIZED: 401, INVALID_REQUEST: 400, PROVIDER_INVALID_RESPONSE: 502,
  PROVIDER_UNAVAILABLE: 503, PROVIDER_TIMEOUT: 504, INTERNAL_ERROR: 500,
};
const MESSAGE_BY_CODE: Record<GatewayErrorCode, string> = {
  UNAUTHORIZED: "Unauthorized", INVALID_REQUEST: "Invalid request",
  PROVIDER_INVALID_RESPONSE: "Provider returned an invalid response",
  PROVIDER_UNAVAILABLE: "Provider unavailable", PROVIDER_TIMEOUT: "Provider request timed out",
  INTERNAL_ERROR: "Gateway request failed",
};

interface ServerDependencies {
  token: string;
  service: TravelSearchService;
}

function sendJson(response: ServerResponse, status: number, body: GatewayErrorBody | GatewaySearchResponse | { status: "ok" }): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function authorized(header: string | undefined, token: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  const supplied = match?.[1] ?? "";
  const expectedDigest = createHash("sha256").update(token).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return match !== null && timingSafeEqual(expectedDigest, suppliedDigest);
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new GatewayServiceError("INVALID_REQUEST", "Invalid request"));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch {
        reject(new GatewayServiceError("INVALID_REQUEST", "Invalid request"));
      }
    });
    request.on("error", () => reject(new GatewayServiceError("INVALID_REQUEST", "Invalid request")));
  });
}

function sendStableError(response: ServerResponse, error: unknown): void {
  const code = error instanceof GatewayServiceError ? error.code : "INTERNAL_ERROR";
  sendJson(response, STATUS_BY_CODE[code], { code, message: MESSAGE_BY_CODE[code] });
}

export function createGatewayServer(dependencies: ServerDependencies): Server {
  return createServer((request, response) => {
    void (async () => {
    if (request.method === "GET" && request.url === "/healthz") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/search") {
      sendJson(response, 400, { code: "INVALID_REQUEST", message: "Invalid request" });
      return;
    }
    if (!authorized(request.headers.authorization, dependencies.token)) {
      sendJson(response, 401, { code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    try {
      const input = await readJson(request);
      sendJson(response, 200, await dependencies.service.search(input));
    } catch (error) {
      sendStableError(response, error);
    }
    })();
  });
}

export function startGatewayServer(): Server {
  const token = process.env.TRAVEL_GATEWAY_TOKEN;
  if (token === undefined || token.length === 0) throw new Error("TRAVEL_GATEWAY_TOKEN is required");
  const server = createGatewayServer({ token, service: createTravelSearchService() });
  const port = Number(process.env.PORT ?? 3_000);
  server.listen(port);
  return server;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) startGatewayServer();
