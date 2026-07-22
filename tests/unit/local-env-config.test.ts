import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('local environment configuration', () => {
  it('publishes a safe example and explicit local scripts', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    const example = readFileSync('.env.example', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(gitignore).toContain('!.env.example');
    expect(example).toContain('TVCMALL_API_ENV=sandbox');
    expect(example).toContain('TVCMALL_WEBAPI_BASE_URL=http://192.168.1.100:8084/api/m');
    expect(example).not.toContain('TVCMALL_API_KEY');
    expect(packageJson.scripts['dev:local']).toBe('node --env-file=.env.local --import tsx src/index.ts');
    expect(packageJson.scripts['start:local']).toBe('node --env-file=.env.local dist/index.js');
  });
});
