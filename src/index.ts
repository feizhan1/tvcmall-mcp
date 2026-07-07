#!/usr/bin/env node
import { runCli } from './cli/app.js';
import { redactSensitiveData } from './security/redact.js';

try {
  await runCli(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${redactSensitiveData(message)}\n`);
  process.exitCode = 1;
}
