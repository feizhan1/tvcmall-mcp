import type { ProductClient, ProductSearchInput, ProductSearchResult, ProductSummary } from './product-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';

const FAKE_PRODUCTS: ProductSummary[] = [
  {
    id: 'prd_iphone_case_001',
    sku: 'TVC-IP15-CASE-CLEAR',
    title: 'Clear MagSafe Case for iPhone 15 Pro Max',
    price: 3.98,
    currency: 'USD',
    stock_status: 'in_stock',
    category: 'Phone Cases',
    summary: 'Transparent shockproof iPhone case with MagSafe-compatible ring.'
  },
  {
    id: 'prd_iphone_case_002',
    sku: 'TVC-IP14-CASE-RUGGED',
    title: 'Rugged Armor Case for iPhone 14 Series',
    price: 4.65,
    currency: 'USD',
    stock_status: 'in_stock',
    category: 'Phone Cases',
    summary: 'Dual-layer protective case for wholesale iPhone accessory buyers.'
  },
  {
    id: 'prd_iphone_case_003',
    sku: 'TVC-IP13-WALLET-BLK',
    title: 'PU Leather Wallet Case for iPhone 13',
    price: 2.89,
    currency: 'USD',
    stock_status: 'low_stock',
    category: 'Phone Cases',
    summary: 'Folio wallet case with card slots and stand function.'
  },
  {
    id: 'prd_usb_c_001',
    sku: 'TVC-USBC-20W-PD',
    title: '20W USB-C PD Fast Charger',
    price: 5.2,
    currency: 'USD',
    stock_status: 'in_stock',
    category: 'Chargers',
    summary: 'Compact wall charger for phones and tablets.'
  },
  {
    id: 'prd_screen_001',
    sku: 'TVC-IP15-TG-2PK',
    title: 'Tempered Glass Screen Protector for iPhone 15',
    price: 1.25,
    currency: 'USD',
    stock_status: 'in_stock',
    category: 'Screen Protectors',
    summary: '2-pack anti-scratch tempered glass with retail packaging.'
  }
];

export class FakeProductClient implements ProductClient {
  async searchProducts(input: ProductSearchInput, _session: StoredAuthSession): Promise<ProductSearchResult> {
    const query = input.query.trim();
    const normalizedQuery = query.toLowerCase();
    const page = Math.max(1, input.page);
    const pageSize = Math.min(Math.max(1, input.page_size), 50);
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);

    const matched = FAKE_PRODUCTS.filter((product) => {
      const haystack = [product.title, product.sku, product.category, product.summary].join(' ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });

    const start = (page - 1) * pageSize;

    return {
      query,
      page,
      page_size: pageSize,
      total: matched.length,
      items: matched.slice(start, start + pageSize)
    };
  }
}
