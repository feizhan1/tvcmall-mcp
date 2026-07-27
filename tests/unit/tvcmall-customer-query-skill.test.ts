import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const skill = readFileSync(
  '.agents/skills/query-tvcmall-customer-data/SKILL.md',
  'utf8'
);

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
});
