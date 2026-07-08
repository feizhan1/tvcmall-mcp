import { startMcpServer } from '../server.js';
import { NullTokenStore } from '../storage/token-store.js';

await startMcpServer({ tokenStore: new NullTokenStore() });
