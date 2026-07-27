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

const requireInterfaceValue = (source: string, key: string) => {
  const value = source.match(new RegExp(`^  ${key}: "([^"]*)"$`, 'm'))?.[1];

  if (value === undefined) {
    throw new Error(`openai.yaml interface.${key} is required`);
  }

  return value;
};

const parseOpenAiMetadata = (source: string): OpenAiMetadata => {
  if (/^\s+url:/m.test(source)) {
    throw new Error('openai.yaml must not declare a URL');
  }
  if (/\bPAT\b|\bBearer\s+\S+|\btmcp_v1_[A-Za-z0-9]/i.test(source)) {
    throw new Error('openai.yaml must not contain a credential value');
  }

  const dependencyEntries = source.match(/^    - type:/gm) ?? [];
  if (dependencyEntries.length !== 1) {
    throw new Error('openai.yaml must declare exactly one MCP dependency');
  }

  const dependency = source.match(
    /^dependencies:\n  tools:\n    - type: "([^"]*)"\n      value: "([^"]*)"\n      description: "([^"]*)"\n      transport: "([^"]*)"$/m
  );
  if (!dependency) {
    throw new Error('openai.yaml dependency must use the generated MCP field layout');
  }

  return {
    displayName: requireInterfaceValue(source, 'display_name'),
    shortDescription: requireInterfaceValue(source, 'short_description'),
    defaultPrompt: requireInterfaceValue(source, 'default_prompt'),
    dependency: {
      type: dependency[1],
      value: dependency[2],
      description: dependency[3],
      transport: dependency[4]
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

const assertAccountRouteContract = (markdown: string) => {
  const pointsRow = routeTableRow(markdown, 'tvcmall_list_point_records');
  const balanceRow = routeTableRow(markdown, 'tvcmall_list_balance_records');

  if (!/`direction`\s*使用[^|]*`got`/.test(pointsRow)) {
    throw new Error('tvcmall_list_point_records route must include direction "got"');
  }
  if (!/`direction`\s*使用[^|]*`expense`/.test(balanceRow)) {
    throw new Error('tvcmall_list_balance_records route must include direction "expense"');
  }
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
});
