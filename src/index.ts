import { loadRuntimeConfig } from './config/runtime-config.js';
import { startMcpHttpServer } from './http/mcp-http-server.js';
import { createMcpHttpLogger } from './logging/mcp-http-logger.js';
import { redactSensitiveData } from './security/redact.js';

try {
  const config = loadRuntimeConfig();
  const logger = createMcpHttpLogger({ level: config.logLevel });
  await startMcpHttpServer({
    host: config.mcpHost,
    logger,
    port: config.mcpPort,
    mcpPath: config.mcpPath
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${redactSensitiveData(message)}\n`);
  process.exitCode = 1;
}
