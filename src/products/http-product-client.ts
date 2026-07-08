import { BaseHttpClient, firstArray, firstObject, readInteger, readNumber, readString, unwrapPayload, type HttpClientOptions, type JsonObject } from '../api/http-client.js';
import type { StoredAuthSession } from '../storage/token-store.js';
import type { ProductClient, ProductDetail, ProductSearchInput, ProductSearchResult, ProductSummary } from './product-client.js';

export class HttpProductClient extends BaseHttpClient implements ProductClient {
  constructor(options: HttpClientOptions) {
    super(options);
  }

  async searchProducts(input: ProductSearchInput, session: StoredAuthSession): Promise<ProductSearchResult> {
    const body = {
      pageindex: input.page,
      pagesize: input.page_size,
      sort: 'default',
      attributes: [],
      catalogCodes: [],
      purchaseTag: '0',
      keywords: input.query,
      url: '/search',
      noAttr: true,
      fromAlgolia: true
    };
    const response = await this.fetchImpl(this.createUrl('/v3/product/list/search/mapping', { body: JSON.stringify(body) }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall product search'));
    const items = firstArray(payload, ['items', 'list', 'products', 'records']).map(mapProductSummary);

    return {
      query: input.query,
      page: input.page,
      page_size: input.page_size,
      total: readInteger(payload, ['total', 'totalCount', 'count', 'records'], items.length),
      items
    };
  }

  async getProductDetail(productId: string, session: StoredAuthSession): Promise<ProductDetail | null> {
    const response = await this.fetchImpl(this.createUrl('/v3/productdetail/detail', { body: JSON.stringify({ url: productId }) }), {
      method: 'GET',
      headers: this.authHeaders(session)
    });
    const payload = unwrapPayload(await this.readJson(response, 'TVCMall product detail'));
    const product = firstObject(payload, ['product', 'detail', 'item']) ?? payload;

    if (Object.keys(product).length === 0) return null;
    return mapProductDetail(product);
  }
}

function mapProductSummary(source: JsonObject): ProductSummary {
  const id = readString(source, ['id', 'product_id', 'productId', 'goodsId', 'spu', 'sku']);
  const sku = readString(source, ['sku', 'skuCode', 'goodsCode', 'productSku'], id);
  const title = readString(source, ['title', 'name', 'productName', 'product_name'], sku || id);

  return {
    id,
    sku,
    title,
    price: readNumber(source, ['price', 'salePrice', 'finalPrice', 'unitPrice']),
    currency: 'USD',
    stock_status: mapStockStatus(source),
    category: readString(source, ['category', 'categoryName', 'catalogName']),
    summary: readString(source, ['summary', 'brief', 'description', 'shortDescription'], title)
  };
}

function mapProductDetail(source: JsonObject): ProductDetail {
  const summary = mapProductSummary(source);
  return {
    ...summary,
    moq: Math.max(1, readInteger(source, ['moq', 'minOrderQuantity', 'minimumOrderQuantity'], 1)),
    weight_kg: readNumber(source, ['weight_kg', 'weightKg', 'weight']),
    dimensions_cm: {
      length: readNumber(source, ['length', 'length_cm', 'lengthCm']),
      width: readNumber(source, ['width', 'width_cm', 'widthCm']),
      height: readNumber(source, ['height', 'height_cm', 'heightCm'])
    },
    attributes: firstArray(source, ['attributes', 'attrs', 'specifications']).map((item) => ({
      name: readString(item, ['name', 'key', 'label']),
      value: readString(item, ['value', 'text'])
    })),
    images: readImageList(source)
  };
}

function mapStockStatus(source: JsonObject): ProductSummary['stock_status'] {
  const raw = readString(source, ['stock_status', 'stockStatus', 'inventoryStatus', 'status']).toLowerCase();
  if (raw.includes('low')) return 'low_stock';
  if (raw.includes('out')) return 'out_of_stock';
  if (raw.includes('in')) return 'in_stock';

  const stock = readNumber(source, ['stock', 'stockQuantity', 'inventory'], Number.NaN);
  if (Number.isFinite(stock)) return stock <= 0 ? 'out_of_stock' : stock < 10 ? 'low_stock' : 'in_stock';
  return 'in_stock';
}

function readImageList(source: JsonObject): string[] {
  const direct = source.images;
  if (Array.isArray(direct)) {
    return direct.map((item) => typeof item === 'string' ? item : readString(item as JsonObject, ['url', 'src'])).filter(Boolean);
  }
  const image = readString(source, ['image', 'imageUrl', 'mainImage']);
  return image ? [image] : [];
}
