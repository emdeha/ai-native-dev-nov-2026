import process from "node:process";
import { startDemoServer } from "./demo-server.ts";

const seatServiceUrl = process.env["SEAT_SERVICE_URL"] ?? "http://127.0.0.1:8080";
const port = Number(process.env["UI_PORT"] ?? "5173");

const demo = await startDemoServer({ seatServiceUrl, port });
process.stdout.write(`Last Seat demo UI on ${demo.url} (seating service ${seatServiceUrl})\n`);
