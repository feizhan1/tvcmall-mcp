import type { StoredAuthSession } from '../storage/token-store.js';

export interface ProductSearchInput {
  query: string;
  page: number;
  page_size: number;
}

export interface ProductSummary {
  id: string;
  sku: string;
  title: string;
  price: number;
  currency: 'USD';
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
  category: string;
  summary: string;
}

export interface ProductDetail extends ProductSummary {
  moq: number;
  weight_kg: number;
  dimensions_cm: {
    length: number;
    width: number;
    height: number;
  };
  attributes: Array<{
    name: string;
    value: string;
  }>;
  images: string[];
}

export interface ProductSearchResult {
  query: string;
  page: number;
  page_size: number;
  total: number;
  items: ProductSummary[];
}

export interface ProductClient {
  searchProducts(input: ProductSearchInput, session: StoredAuthSession): Promise<ProductSearchResult>;
  getProductDetail(productId: string, session: StoredAuthSession): Promise<ProductDetail | null>;
}
