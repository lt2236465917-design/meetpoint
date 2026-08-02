import process from "node:process";
import { probeLiveContract } from "../dist/contract-probe.js";

process.stdout.write(`${JSON.stringify(await probeLiveContract())}\n`);
