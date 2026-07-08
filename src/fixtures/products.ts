import type { ProductDetail } from '../products/product-client.js';

export const FIXTURE_PRODUCT_DETAILS: ProductDetail[] = [
  {
    id: 'prd_iphone_case_001',
    sku: 'TVC-IP15-CASE-CLEAR',
    title: 'Clear MagSafe Case for iPhone 15 Pro Max',
    price: 3.98,
    currency: 'USD',
    stock_status: 'in_stock',
    category: 'Phone Cases',
    summary: 'Transparent shockproof iPhone case with MagSafe-compatible ring.',
    moq: 10,
    weight_kg: 0.08,
    dimensions_cm: { length: 18, width: 9, height: 1.5 },
    attributes: [
      { name: 'Compatible Model', value: 'iPhone 15 Pro Max' },
      { name: 'Material', value: 'TPU + PC' },
      { name: 'Feature', value: 'MagSafe compatible' }
    ],
    images: ['https://example.test/images/prd_iphone_case_001_1.jpg']
  },
  {
    id: 'prd_iphone_case_002',
    sku: 'TVC-IP14-CASE-RUGGED',
    title: 'Rugged Armor Case for iPhone 14 Series',
    price: 4.65,
    currency: 'USD',
    stock_status: 'in_stock',
    category: 'Phone Cases',
    summary: 'Dual-layer protective case for wholesale iPhone accessory buyers.',
    moq: 20,
    weight_kg: 0.11,
    dimensions_cm: { length: 18, width: 9.5, height: 2 },
    attributes: [
      { name: 'Compatible Model', value: 'iPhone 14 Series' },
      { name: 'Material', value: 'TPU + PC' },
      { name: 'Feature', value: 'Drop protection' }
    ],
    images: ['https://example.test/images/prd_iphone_case_002_1.jpg']
  },
  {
    id: 'prd_iphone_case_003',
    sku: 'TVC-IP13-WALLET-BLK',
    title: 'PU Leather Wallet Case for iPhone 13',
    price: 2.89,
    currency: 'USD',
    stock_status: 'low_stock',
    category: 'Phone Cases',
    summary: 'Folio wallet case with card slots and stand function.',
    moq: 10,
    weight_kg: 0.13,
    dimensions_cm: { length: 17, width: 8.5, height: 2.2 },
    attributes: [
      { name: 'Compatible Model', value: 'iPhone 13' },
      { name: 'Material', value: 'PU leather' },
      { name: 'Feature', value: 'Card slots' }
    ],
    images: ['https://example.test/images/prd_iphone_case_003_1.jpg']
  },
  {
    id: 'prd_usb_c_001',
    sku: 'TVC-USBC-20W-PD',
    title: '20W USB-C PD Fast Charger',
    price: 5.2,
    currency: 'USD',
    stock_status: 'in_stock',
    category: 'Chargers',
    summary: 'Compact wall charger for phones and tablets.',
    moq: 30,
    weight_kg: 0.06,
    dimensions_cm: { length: 5, width: 4, height: 3 },
    attributes: [
      { name: 'Power', value: '20W' },
      { name: 'Port', value: 'USB-C' },
      { name: 'Protocol', value: 'PD' }
    ],
    images: ['https://example.test/images/prd_usb_c_001_1.jpg']
  },
  {
    id: 'prd_screen_001',
    sku: 'TVC-IP15-TG-2PK',
    title: 'Tempered Glass Screen Protector for iPhone 15',
    price: 1.25,
    currency: 'USD',
    stock_status: 'in_stock',
    category: 'Screen Protectors',
    summary: '2-pack anti-scratch tempered glass with retail packaging.',
    moq: 50,
    weight_kg: 0.04,
    dimensions_cm: { length: 18, width: 9, height: 0.5 },
    attributes: [
      { name: 'Compatible Model', value: 'iPhone 15' },
      { name: 'Hardness', value: '9H' },
      { name: 'Pack', value: '2 pieces' }
    ],
    images: ['https://example.test/images/prd_screen_001_1.jpg']
  }
];
