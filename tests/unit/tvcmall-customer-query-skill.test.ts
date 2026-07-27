import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const skill = readFileSync(
  '.agents/skills/query-tvcmall-customer-data/SKILL.md',
  'utf8'
);
const openAiYaml = readFileSync(
  '.agents/skills/query-tvcmall-customer-data/agents/openai.yaml',
  'utf8'
);

type OpenAiMetadata = {
  displayName: string;
  shortDescription: string;
  defaultPrompt: string;
  dependency: {
    type: string;
    value: string;
    description: string;
    transport: string;
  };
};

type StringMap = Record<string, string>;

const INTERFACE_KEYS = ['display_name', 'short_description', 'default_prompt'] as const;
const DEPENDENCY_KEYS = ['type', 'value', 'description', 'transport'] as const;

const parseQuotedEntry = (entry: string, scope: string) => {
  const separator = entry.indexOf(': "');
  const closingQuote = entry.indexOf('"', separator + 3);
  const key = entry.slice(0, separator);

  if (
    separator <= 0 ||
    closingQuote !== entry.length - 1 ||
    !/^[a-z_]+$/.test(key)
  ) {
    throw new Error(`openai.yaml ${scope} must use quoted key-value entries`);
  }

  return { key, value: entry.slice(separator + 3, -1) };
};

const assignAllowedValue = (
  values: StringMap,
  key: string,
  value: string,
  allowedKeys: readonly string[],
  scope: string
) => {
  if (!allowedKeys.includes(key)) {
    if (key === 'url') {
      throw new Error('openai.yaml must not declare a URL');
    }
    throw new Error(`openai.yaml ${scope} contains unknown key "${key}"`);
  }
  if (Object.prototype.hasOwnProperty.call(values, key)) {
    throw new Error(`openai.yaml must not repeat ${scope}.${key}`);
  }

  values[key] = value;
};

const requireKeys = (values: StringMap, keys: readonly string[], scope: string) => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      throw new Error(`openai.yaml ${scope}.${key} is required`);
    }
  }
};

const parseOpenAiMetadata = (source: string): OpenAiMetadata => {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();

  let index = 0;
  const takeLine = (expected: string, error: string) => {
    if (lines[index] !== expected) {
      throw new Error(error);
    }
    index += 1;
  };
  const readMappingBlock = (
    indent: string,
    allowedKeys: readonly string[],
    scope: string
  ) => {
    const values: StringMap = {};

    while (lines[index]?.startsWith(indent) && !lines[index]?.startsWith(`${indent} `)) {
      const { key, value } = parseQuotedEntry(lines[index].slice(indent.length), scope);
      assignAllowedValue(values, key, value, allowedKeys, scope);
      index += 1;
    }

    requireKeys(values, allowedKeys, scope);
    return values;
  };

  takeLine('interface:', 'openai.yaml must start with the interface mapping');
  const interfaceValues = readMappingBlock('  ', INTERFACE_KEYS, 'interface');
  takeLine('', 'openai.yaml must separate interface and dependencies with one blank line');
  takeLine('dependencies:', 'openai.yaml must declare dependencies after interface');
  takeLine('  tools:', 'openai.yaml dependencies must contain only tools');

  if (!lines[index]?.startsWith('    - ')) {
    throw new Error('openai.yaml dependencies.tools must contain exactly one item');
  }

  const dependencyValues: StringMap = {};
  const firstDependency = parseQuotedEntry(
    lines[index].slice('    - '.length),
    'dependencies.tools[0]'
  );
  assignAllowedValue(
    dependencyValues,
    firstDependency.key,
    firstDependency.value,
    DEPENDENCY_KEYS,
    'dependencies.tools[0]'
  );
  index += 1;

  while (lines[index]?.startsWith('      ')) {
    const entry = parseQuotedEntry(lines[index].slice(6), 'dependencies.tools[0]');
    assignAllowedValue(
      dependencyValues,
      entry.key,
      entry.value,
      DEPENDENCY_KEYS,
      'dependencies.tools[0]'
    );
    index += 1;
  }

  requireKeys(dependencyValues, DEPENDENCY_KEYS, 'dependencies.tools[0]');
  if (lines[index]?.startsWith('    - ')) {
    throw new Error('openai.yaml dependencies.tools must contain exactly one item');
  }
  if (index !== lines.length) {
    throw new Error(`openai.yaml contains unsupported structure: "${lines[index]}"`);
  }

  return {
    displayName: interfaceValues.display_name,
    shortDescription: interfaceValues.short_description,
    defaultPrompt: interfaceValues.default_prompt,
    dependency: {
      type: dependencyValues.type,
      value: dependencyValues.value,
      description: dependencyValues.description,
      transport: dependencyValues.transport
    }
  };
};

const requireEqual = (actual: string, expected: string, error: string) => {
  if (actual !== expected) {
    throw new Error(error);
  }
};

const assertOpenAiMetadataContract = (source: string) => {
  const metadata = parseOpenAiMetadata(source);

  if (/https?:\/\//i.test(source)) {
    throw new Error('openai.yaml must not declare a URL');
  }
  if (/\bPAT\b|\bBearer\s+\S+|\btmcp_v1_[A-Za-z0-9]/i.test(source)) {
    throw new Error('openai.yaml must not contain a credential value');
  }

  requireEqual(
    metadata.displayName,
    'TVCMall 客户查询',
    'openai.yaml interface.display_name must equal "TVCMall 客户查询"'
  );

  const shortDescriptionLength = Array.from(metadata.shortDescription).length;
  if (shortDescriptionLength < 25 || shortDescriptionLength > 64) {
    throw new Error(
      'openai.yaml interface.short_description must contain 25-64 Unicode characters'
    );
  }
  if (!metadata.defaultPrompt.includes('$query-tvcmall-customer-data')) {
    throw new Error(
      'openai.yaml interface.default_prompt must include "$query-tvcmall-customer-data"'
    );
  }

  requireEqual(
    metadata.dependency.type,
    'mcp',
    'openai.yaml dependency.type must be "mcp"'
  );
  requireEqual(
    metadata.dependency.value,
    'tvcmall',
    'openai.yaml dependency.value must be "tvcmall"'
  );
  requireEqual(
    metadata.dependency.transport,
    'streamable_http',
    'openai.yaml dependency.transport must be "streamable_http"'
  );
  requireEqual(
    metadata.dependency.description,
    '由 MCP Client 配置的 TVCMall Customer MCP',
    'openai.yaml dependency.description must describe the configured TVCMall MCP'
  );
};

const routeTableRow = (markdown: string, tool: string) => {
  const row = markdown
    .split('\n')
    .find((line) => line.startsWith('|') && line.includes(`\`${tool}\``));

  if (!row) {
    throw new Error(`routing table must contain ${tool}`);
  }

  return row;
};

const routeDirections = (row: string, tool: string) => {
  const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
  const constraint = cells[2];
  const tokens = Array.from(constraint.matchAll(/`([^`]+)`/g), (match) => match[1]);

  if (cells.length !== 3 || cells[1] !== `\`${tool}\`` || tokens[0] !== 'direction') {
    throw new Error(`${tool} routing table row must declare direction values`);
  }

  return tokens.slice(1);
};

const assertDirectionSet = (tool: string, row: string, allowed: readonly string[]) => {
  const directions = routeDirections(row, tool);

  for (const direction of allowed) {
    if (!directions.includes(direction)) {
      throw new Error(`${tool} route must include direction "${direction}"`);
    }
  }
  const unexpected = directions.find((direction) => !allowed.includes(direction));
  if (unexpected) {
    throw new Error(`${tool} route must not include direction "${unexpected}"`);
  }
  if (directions.length !== allowed.length) {
    throw new Error(`${tool} route must list each allowed direction exactly once`);
  }
};

const assertAccountRouteContract = (markdown: string) => {
  const pointsRow = routeTableRow(markdown, 'tvcmall_list_point_records');
  const balanceRow = routeTableRow(markdown, 'tvcmall_list_balance_records');

  assertDirectionSet('tvcmall_list_point_records', pointsRow, ['all', 'got', 'used']);
  assertDirectionSet('tvcmall_list_balance_records', balanceRow, ['all', 'income', 'expense']);
};

const scenarios = [
  {
    version: 'v1',
    name: '商品结果唯一性',
    expectedConstraints: {
      uniqueTotal: 'total === 1',
      multipleTotal: 'total > 1',
      currentPageItems: 'items'
    }
  },
  {
    version: 'v1',
    name: '已发货订单物流与运费',
    expectedConstraints: {
      shippedOrders: 'tvcmall_list_orders(status=V3Shipped)',
      batchTracking: 'tvcmall_batch_get_tracking',
      productShippingEstimate: 'tvcmall_estimate_shipping'
    }
  },
  {
    version: 'v1',
    name: '对话凭据与认证状态',
    expectedConstraints: {
      credentials: ['PAT', 'TVCMALL_API_KEY', 'Authorization'],
      secretConfiguration: 'MCP Client 的 secret',
      configuredOnly: 'configured'
    }
  }
] as const;

const paragraphContaining = (needle: string) =>
  skill
    .split('\n\n')
    .find((paragraph) => paragraph.includes(needle)) ?? '';

const sectionAfter = (heading: string) => {
  const content = skill.slice(skill.indexOf(heading) + heading.length);
  const nextHeading = content.indexOf('\n## ');

  return nextHeading === -1 ? content : content.slice(0, nextHeading);
};

describe('TVCMall Customer Query Skill contract', () => {
  it(`${scenarios[0].version}: ${scenarios[0].name} only retrieves detail for a globally unique result`, () => {
    const { uniqueTotal, multipleTotal, currentPageItems } =
      scenarios[0].expectedConstraints;
    const productDecision = paragraphContaining('商品搜索无结果时停止');

    expect(productDecision).toContain(uniqueTotal);
    expect(productDecision).toMatch(/total\s*={3}\s*1[\s\S]*详情/);
    expect(productDecision).toContain(multipleTotal);
    expect(productDecision).toMatch(
      new RegExp(
        `${multipleTotal.replace('>', '\\>')}[\\s\\S]*${currentPageItems}[\\s\\S]*确认[\\s\\S]*(?:自行)[\\s\\S]*详情`
      )
    );
  });

  it(`${scenarios[1].version}: ${scenarios[1].name} sequences tracking after shipped orders and excludes product shipping estimates`, () => {
    const { shippedOrders, batchTracking, productShippingEstimate } =
      scenarios[1].expectedConstraints;
    const shippedOrderDecision = paragraphContaining(shippedOrders);
    const orderFreightRoute = skill
      .split('\n')
      .find((line) => line.includes('tvcmall_get_tracking_info')) ?? '';

    expect(shippedOrderDecision).toContain(shippedOrders);
    expect(shippedOrderDecision.indexOf(batchTracking)).toBeGreaterThan(
      shippedOrderDecision.indexOf(shippedOrders)
    );
    expect(orderFreightRoute).toContain(productShippingEstimate);
    expect(orderFreightRoute).toMatch(/(?:不要|不得)[\s\S]*(?:estimate_shipping)/);
  });

  it(`${scenarios[2].version}: ${scenarios[2].name} rejects chat credentials and routes auth status safely`, () => {
    const { credentials, secretConfiguration, configuredOnly } =
      scenarios[2].expectedConstraints;
    const authenticationRules = sectionAfter('## 认证与错误');
    const authStatusRoute = skill
      .split('\n')
      .find((line) => line.includes('tvcmall_auth_status')) ?? '';

    for (const credential of credentials) {
      expect(authenticationRules).toContain(credential);
    }
    expect(authenticationRules).toMatch(/不接受[\s\S]*使用[\s\S]*复述/);
    expect(authenticationRules).toContain(secretConfiguration);
    expect(authenticationRules).toMatch(/(?:撤销[\s\S]*轮换|轮换[\s\S]*撤销)/);
    expect(authStatusRoute).toMatch(/^\|/);
    expect(authStatusRoute).toContain(configuredOnly);
    expect(authStatusRoute).toMatch(/不[\s\S]*验证[\s\S]*(?:有效|权限|过期)/);
  });

  it('v1: validates generated MCP metadata and rejects unsafe in-memory metadata changes', () => {
    expect(() => assertOpenAiMetadataContract(openAiYaml)).not.toThrow();
    expect(() =>
      assertOpenAiMetadataContract(
        openAiYaml.replace('display_name: "TVCMall 客户查询"', 'display_name: "错误名称"')
      )
    ).toThrow('openai.yaml interface.display_name must equal "TVCMall 客户查询"');
    expect(() =>
      assertOpenAiMetadataContract(
        openAiYaml.replace(
          'short_description: "安全查询 TVCMall 商品、订单、物流、运费、积分和余额流水"',
          'short_description: "过短"'
        )
      )
    ).toThrow('openai.yaml interface.short_description must contain 25-64 Unicode characters');
    expect(() =>
      assertOpenAiMetadataContract(
        openAiYaml.replace(
          '  default_prompt: "使用 $query-tvcmall-customer-data 查询我的 TVCMall 订单和物流状态。"\n',
          ''
        )
      )
    ).toThrow('openai.yaml interface.default_prompt is required');
    expect(() =>
      assertOpenAiMetadataContract(
        openAiYaml.replace('transport: "streamable_http"', 'transport: "stdio"')
      )
    ).toThrow('openai.yaml dependency.transport must be "streamable_http"');
    expect(() =>
      assertOpenAiMetadataContract(
        openAiYaml.replace(
          'transport: "streamable_http"',
          'transport: "streamable_http"\n      url: "disallowed"'
        )
      )
    ).toThrow('openai.yaml must not declare a URL');
  });

  it('v2: rejects duplicate interface metadata keys instead of accepting the first value', () => {
    expect(() =>
      assertOpenAiMetadataContract(
        openAiYaml.replace(
          '  default_prompt: "使用 $query-tvcmall-customer-data 查询我的 TVCMall 订单和物流状态。"\n',
          '  default_prompt: "使用 $query-tvcmall-customer-data 查询我的 TVCMall 订单和物流状态。"\n  default_prompt: "https://unreviewed.example"\n'
        )
      )
    ).toThrow('openai.yaml must not repeat interface.default_prompt');
  });

  it('v2: rejects unknown sensitive interface keys', () => {
    expect(() =>
      assertOpenAiMetadataContract(
        openAiYaml.replace(
          '  default_prompt: "使用 $query-tvcmall-customer-data 查询我的 TVCMall 订单和物流状态。"\n',
          '  default_prompt: "使用 $query-tvcmall-customer-data 查询我的 TVCMall 订单和物流状态。"\n  api_key: "placeholder"\n'
        )
      )
    ).toThrow('openai.yaml interface contains unknown key "api_key"');
  });

  it('v1: keeps points and balance directions on their own routing table rows', () => {
    expect(() => assertAccountRouteContract(skill)).not.toThrow();

    const swappedDirections = skill
      .replace(
        '`direction` 使用 `all`、`got` 或 `used`',
        '`direction` 使用 `all`、`expense` 或 `used`'
      )
      .replace(
        '`direction` 使用 `all`、`income` 或 `expense`',
        '`direction` 使用 `all`、`income` 或 `got`'
      );

    expect(() => assertAccountRouteContract(swappedDirections)).toThrow(
      'tvcmall_list_point_records route must include direction "got"'
    );
    expect(() =>
      assertAccountRouteContract(
        skill.replace(
          '`direction` 使用 `all`、`income` 或 `expense`',
          '`direction` 使用 `all`、`income` 或 `got`'
        )
      )
    ).toThrow('tvcmall_list_balance_records route must include direction "expense"');
  });

  it('v2: rejects expense from the points routing table row', () => {
    expect(() =>
      assertAccountRouteContract(
        skill.replace(
          '`direction` 使用 `all`、`got` 或 `used`',
          '`direction` 使用 `all`、`got`、`used` 或 `expense`'
        )
      )
    ).toThrow('tvcmall_list_point_records route must not include direction "expense"');
  });

  it('v2: rejects got from the balance routing table row', () => {
    expect(() =>
      assertAccountRouteContract(
        skill.replace(
          '`direction` 使用 `all`、`income` 或 `expense`',
          '`direction` 使用 `all`、`income`、`expense` 或 `got`'
        )
      )
    ).toThrow('tvcmall_list_balance_records route must not include direction "got"');
  });
});
