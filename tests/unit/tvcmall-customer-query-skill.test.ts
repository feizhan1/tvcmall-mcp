import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILL_DIRECTORY = '.agents/skills/query-tvcmall-customer-data';
const skill = readFileSync(`${SKILL_DIRECTORY}/SKILL.md`, 'utf8');
const openAiYaml = readFileSync(
  `${SKILL_DIRECTORY}/agents/openai.yaml`,
  'utf8'
);
const registerToolsSource = readFileSync('src/app/register-tools.ts', 'utf8');

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
type SkillDirectoryFiles = Record<string, string>;

const INTERFACE_KEYS = ['display_name', 'short_description', 'default_prompt'] as const;
const DEPENDENCY_KEYS = ['type', 'value', 'description', 'transport'] as const;
// This matches the server's PAT body pattern without anchors for document scanning.
const PAT_VALUE_PATTERN = /tmcp_v1_[^\s.]+\.[^\s.]+/;

const comparePaths = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const readSkillDirectoryFiles = (directory: string): SkillDirectoryFiles => {
  const files: SkillDirectoryFiles = {};
  const visit = (absolutePath: string, relativePath: string) => {
    const entries = readdirSync(absolutePath, { withFileTypes: true })
      .sort((left, right) => comparePaths(left.name, right.name));

    for (const entry of entries) {
      const nextRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;
      const nextAbsolutePath = join(absolutePath, entry.name);

      if (entry.isDirectory()) {
        visit(nextAbsolutePath, nextRelativePath);
      } else if (entry.isFile()) {
        files[nextRelativePath] = readFileSync(nextAbsolutePath, 'utf8');
      }
    }
  };

  visit(directory, '');
  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => comparePaths(left, right)));
};

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

const assertNoUnsafeSkillDirectoryValue = (source: string) => {
  if (/https?:\/\//i.test(source)) {
    throw new Error('Skill directory must not contain a URL');
  }
  if (/\bBearer[ \t]+\S+/i.test(source) || PAT_VALUE_PATTERN.test(source)) {
    throw new Error('Skill directory must not contain a credential value');
  }
  if (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(source) ||
    /(?:\+?\d[\d\s-]{6,}\d)/.test(source) ||
    /(?:地址|address)\s*[:：]\s*\S+/i.test(source)
  ) {
    throw new Error('Skill directory must not contain PII');
  }
};

const requireSkillDirectoryFile = (files: SkillDirectoryFiles, path: string) => {
  const source = files[path];

  if (source === undefined) {
    throw new Error(`Skill directory must contain ${path}`);
  }

  return source;
};

const assertOpenAiMetadataContract = (source: string) => {
  const metadata = parseOpenAiMetadata(source);

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

const assertSkillDirectoryFilesContract = (files: SkillDirectoryFiles) => {
  const skillSource = requireSkillDirectoryFile(files, 'SKILL.md');
  const metadataSource = requireSkillDirectoryFile(files, 'agents/openai.yaml');

  assertOpenAiMetadataContract(metadataSource);
  assertNoUnsafeSkillDirectoryValue(
    Object.entries(files)
      .sort(([left], [right]) => comparePaths(left, right))
      .map(([path, source]) => `${path}\n${source}`)
      .join('\n')
  );
};

const assertSkillDirectoryContract = (skillSource: string, metadataSource: string) =>
  assertSkillDirectoryFilesContract({
    'SKILL.md': skillSource,
    'agents/openai.yaml': metadataSource
  });

const registeredToolNames = (source: string) => {
  const names = Array.from(
    source.matchAll(/\bserver\.registerTool\(\s*'(?<name>tvcmall_[a-z_]+)'/g),
    (match) => match.groups?.name
  );

  if (names.length === 0 || names.some((name) => name === undefined)) {
    throw new Error('register-tools.ts must register at least one tvcmall tool');
  }

  return names as string[];
};

const routeTableToolNames = (markdown: string) => {
  const lines = markdown.split('\n');
  const headerIndex = lines.indexOf('| 意图 | Tool | 约束 |');

  if (headerIndex === -1 || !/^\|\s*---\s*\|\s*---\s*\|\s*---\s*\|$/.test(lines[headerIndex + 1] ?? '')) {
    throw new Error('Skill must contain the routing table header and separator');
  }

  const names: string[] = [];
  for (let index = headerIndex + 2; lines[index]?.startsWith('|'); index += 1) {
    const cells = lines[index].split('|').slice(1, -1).map((cell) => cell.trim());
    const tool = /^`(tvcmall_[a-z_]+)`$/.exec(cells[1] ?? '')?.[1];

    if (cells.length !== 3 || !tool) {
      throw new Error('routing table data rows must contain one tvcmall tool');
    }
    names.push(tool);
  }

  return names;
};

const assertRegisteredToolRouteContract = (markdown: string, registrationSource: string) => {
  const registered = new Set(registeredToolNames(registrationSource));
  const routed = routeTableToolNames(markdown);
  const routeCounts = new Map<string, number>();

  for (const tool of routed) {
    routeCounts.set(tool, (routeCounts.get(tool) ?? 0) + 1);
  }
  for (const [tool, count] of routeCounts) {
    if (count !== 1) {
      throw new Error(`routing table must list registered tool "${tool}" exactly once`);
    }
  }
  for (const tool of routeCounts.keys()) {
    if (!registered.has(tool)) {
      throw new Error(`routing table must not include unregistered tool "${tool}"`);
    }
  }
  for (const tool of registered) {
    if (!routeCounts.has(tool)) {
      throw new Error(`routing table must include registered tool "${tool}"`);
    }
  }
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
    version: 'v2',
    name: '当前商品结果唯一性',
    expectedConstraints: {
      uniqueCurrentItems: '当前 `items` 只有一项',
      multipleCurrentItems: '当前 `items` 多项'
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
  it(`${scenarios[0].version}: ${scenarios[0].name} only retrieves detail when the current items contain one result`, () => {
    const { uniqueCurrentItems, multipleCurrentItems } =
      scenarios[0].expectedConstraints;
    const productDecision = paragraphContaining('商品搜索无结果时停止');

    expect(productDecision).toContain(uniqueCurrentItems);
    expect(productDecision).toMatch(/当前\s*`items`\s*只有一项[\s\S]*用户需要详情/);
    expect(productDecision).toContain(multipleCurrentItems);
    expect(productDecision).toMatch(/当前\s*`items`\s*多项[\s\S]*确认[\s\S]*(?:不能|不要)[\s\S]*自行/);
    expect(productDecision).not.toMatch(/\btotal\b/);
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
    expect(() => assertSkillDirectoryContract(skill, openAiYaml)).not.toThrow();
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

  it.each([
    [
      'a PAT whose token ID begins with an underscore',
      ['tmcp_v1_', '_token', '.', 'secret'].join(''),
      'Skill directory must not contain a credential value'
    ],
    [
      'a PAT whose token ID begins with a hyphen',
      ['tmcp_v1_', '-token', '.', 'secret'].join(''),
      'Skill directory must not contain a credential value'
    ],
    [
      'a Bearer credential',
      ['Bearer', ' ', 'demo_value'].join(''),
      'Skill directory must not contain a credential value'
    ],
    ['a URL', ['https', '://', 'unreviewed.example'].join(''), 'Skill directory must not contain a URL'],
    ['an email address', ['user', '@', 'example.test'].join(''), 'Skill directory must not contain PII'],
    ['a phone number', ['+86', ' ', '138', ' ', '0013', ' ', '8000'].join(''), 'Skill directory must not contain PII'],
    ['a physical address', ['地址', '：', '虚构测试街道 1 号'].join(''), 'Skill directory must not contain PII']
  ])('v2: rejects %s anywhere in the Skill directory', (_name, unsafeValue, expectedError) => {
    expect(() => assertSkillDirectoryContract(`${skill}\n${unsafeValue}`, openAiYaml)).toThrow(
      expectedError
    );
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

  it('v3: keeps the Skill routing table exactly aligned with registered tools', () => {
    expect(() => assertRegisteredToolRouteContract(skill, registerToolsSource)).not.toThrow();
  });

  it('v3: rejects a missing registered tool from the Skill routing table', () => {
    const pointsRoute = routeTableRow(skill, 'tvcmall_get_points');

    expect(() =>
      assertRegisteredToolRouteContract(
        skill.replace(`${pointsRoute}\n`, ''),
        registerToolsSource
      )
    ).toThrow('routing table must include registered tool "tvcmall_get_points"');
  });

  it('v3: rejects an unregistered tool from the Skill routing table', () => {
    const balanceRoute = routeTableRow(skill, 'tvcmall_list_balance_records');
    const unknownRoute = '| 未注册工具 | `tvcmall_unregistered_tool` | 不应存在 |';

    expect(() =>
      assertRegisteredToolRouteContract(
        skill.replace(balanceRoute, `${balanceRoute}\n${unknownRoute}`),
        registerToolsSource
      )
    ).toThrow('routing table must not include unregistered tool "tvcmall_unregistered_tool"');
  });

  it('v3: rejects a duplicate registered tool in the Skill routing table', () => {
    const pointsRoute = routeTableRow(skill, 'tvcmall_get_points');

    expect(() =>
      assertRegisteredToolRouteContract(
        skill.replace(pointsRoute, `${pointsRoute}\n${pointsRoute}`),
        registerToolsSource
      )
    ).toThrow('routing table must list registered tool "tvcmall_get_points" exactly once');
  });

  it('v3: recursively reads all regular files in the actual Skill directory', () => {
    const files = readSkillDirectoryFiles(SKILL_DIRECTORY);

    expect(files).toHaveProperty('SKILL.md', skill);
    expect(files).toHaveProperty('agents/openai.yaml', openAiYaml);
    expect(() => assertSkillDirectoryFilesContract(files)).not.toThrow();
  });

  const nestedUnsafeResourceCases = [
    [
      'PAT',
      ['tmcp_v1_', '_token', '.', 'secret'].join(''),
      'Skill directory must not contain a credential value'
    ],
    [
      'URL',
      ['https', '://', 'unreviewed.example'].join(''),
      'Skill directory must not contain a URL'
    ],
    [
      'Bearer',
      ['Bearer', ' ', 'demo_value'].join(''),
      'Skill directory must not contain a credential value'
    ],
    [
      'email',
      ['user', '@', 'example.test'].join(''),
      'Skill directory must not contain PII'
    ],
    [
      'phone',
      ['+86', ' ', '138', ' ', '0013', ' ', '8000'].join(''),
      'Skill directory must not contain PII'
    ],
    [
      'address',
      ['地址', '：', '虚构测试街道 1 号'].join(''),
      'Skill directory must not contain PII'
    ]
  ] as const;

  it('v4: covers every sensitive value category in nested Skill resources', () => {
    expect(nestedUnsafeResourceCases.map(([category]) => category)).toEqual([
      'PAT',
      'URL',
      'Bearer',
      'email',
      'phone',
      'address'
    ]);
  });

  it.each(nestedUnsafeResourceCases)(
    'v4: rejects a nested Skill resource containing %s',
    (_category, unsafeValue, expectedError) => {
      const unsafeFiles = {
        ...readSkillDirectoryFiles(SKILL_DIRECTORY),
        'references/unsafe.md': unsafeValue
      };

      expect(() => assertSkillDirectoryFilesContract(unsafeFiles)).toThrow(
        expectedError
      );
    }
  );
});
