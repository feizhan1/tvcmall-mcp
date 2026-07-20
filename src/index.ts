import { loadRuntimeConfig } from './config/runtime-config.js';
import { startMcpHttpServer } from './http/mcp-http-server.js';
import { redactSensitiveData } from './security/redact.js';

try {
  const config = loadRuntimeConfig();
  await startMcpHttpServer({
    host: config.mcpHost,
    port: config.mcpPort,
    mcpPath: config.mcpPath
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${redactSensitiveData(message)}\n`);
  process.exitCode = 1;
}
