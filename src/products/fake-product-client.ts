import { FIXTURE_PRODUCT_DETAILS } from '../fixtures/products.js';
import type {
  ProductClient,
  ProductDetail,
  ProductSearchInput,
  ProductSearchResult,
  ProductSummary
} from './product-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';

const FAKE_PRODUCTS: ProductSummary[] = FIXTURE_PRODUCT_DETAILS.map(
  ({ moq: _moq, weight_kg: _weightKg, dimensions_cm: _dimensions, attributes: _attributes, images: _images, ...summary }) => summary
);

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

  async getProductDetail(productId: string, _session: StoredAuthSession): Promise<ProductDetail | null> {
    return FIXTURE_PRODUCT_DETAILS.find((product) => product.product_id === productId) ?? null;
  }
}
