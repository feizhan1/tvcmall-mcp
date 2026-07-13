import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { StringDecoder } from 'node:string_decoder';

export interface McpStdioHarnessOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: any;
}

export interface McpStdioHarness {
  initialize(): Promise<JsonRpcResponse>;
  request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse>;
  stderr(): Promise<string>;
  close(): Promise<void>;
}

export async function createMcpStdioHarness(options: McpStdioHarnessOptions): Promise<McpStdioHarness> {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd ?? process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env }
  });

  const harness = new ChildProcessMcpStdioHarness(child, options.requestTimeoutMs ?? 5000);
  await harness.waitForStartup(options.startupTimeoutMs ?? 5000);
  return harness;
}

class ChildProcessMcpStdioHarness implements McpStdioHarness {
  private nextId = 1;
  private readonly pending = new Map<number, (response: JsonRpcResponse) => void>();
  private readonly stderrChunks: string[] = [];
  private stdoutBuffer = '';
  private closed = false;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly requestTimeoutMs: number
  ) {
    const decoder = new StringDecoder('utf8');

    child.stdout.on('data', (chunk: Buffer) => {
      this.stdoutBuffer += decoder.write(chunk);
      this.processStdoutBuffer();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      this.stderrChunks.push(chunk.toString('utf8'));
    });
  }

  async waitForStartup(timeoutMs: number): Promise<void> {
    if (this.child.exitCode !== null) {
      throw new Error(`MCP server exited during startup with code ${this.child.exitCode}`);
    }

    await Promise.race([
      new Promise<void>((resolve) => setTimeout(resolve, 50)),
      once(this.child, 'exit').then(([code]) => {
        throw new Error(`MCP server exited during startup with code ${code}`);
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('MCP server startup timed out')), timeoutMs))
    ]);
  }

  async initialize(): Promise<JsonRpcResponse> {
    const response = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'tvcmall-mcp-harness', version: '0.0.0' }
    });
    this.sendNotification('notifications/initialized', {});
    return response;
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.requestTimeoutMs);

      this.pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });

    this.writeMessage({ jsonrpc: '2.0', id, method, params });
    return responsePromise;
  }

  async stderr(): Promise<string> {
    return this.stderrChunks.join('');
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    this.child.stdin.end();
    if (this.child.exitCode === null) {
      this.child.kill('SIGTERM');
      await Promise.race([
        once(this.child, 'exit'),
        new Promise<void>((resolve) => setTimeout(resolve, 500))
      ]);
    }
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    this.writeMessage({ jsonrpc: '2.0', method, params });
  }

  private writeMessage(message: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private processStdoutBuffer(): void {
    let newlineIndex = this.stdoutBuffer.indexOf('\n');

    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (line) {
        this.handleStdoutLine(line);
      }

      newlineIndex = this.stdoutBuffer.indexOf('\n');
    }
  }

  private handleStdoutLine(line: string): void {
    const message = JSON.parse(line) as JsonRpcResponse;

    if (typeof message.id === 'number') {
      const resolve = this.pending.get(message.id);
      if (resolve) {
        this.pending.delete(message.id);
        resolve(message);
      }
    }
  }
}
