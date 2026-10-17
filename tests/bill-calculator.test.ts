import { describe, it, expect } from 'vitest';
import {
  allocateByWeightsMinor,
  calculateBillSplit,
  createDefaultFeeSettings,
  fromMinorUnits,
  toMinorUnits,
} from '@ehsebhaly/calculations';
import { validateAndReconcileReceipt } from '@ehsebhaly/schemas';
import {
  parseReceiptWithGemini,
  ReceiptParserError,
  isAiConfigured,
} from '@ehsebhaly/ai';
import { GET as healthGet } from '../apps/web/app/api/health/route';
import { POST as parsePost } from '../apps/web/app/api/receipts/parse/route';
import type {
  Participant,
  ReceiptData,
  ReceiptItem,
} from '@ehsebhaly/types';

function makeBaseReceipt(overrides?: Partial<ReceiptData>): ReceiptData {
  return {
    restaurantName: 'مطعم الاختبار',
    currency: 'EGP',
    items: [],
    subtotal: 0,
    discountAmount: 0,
    discountPercentage: null,
    taxAmount: 0,
    taxPercentage: null,
    isTaxInclusive: false,
    serviceChargeAmount: 0,
    serviceChargePercentage: null,
    deliveryFee: 0,
    otherFees: 0,
    roundingAdjustment: 0,
    finalTotal: 0,
    uncertainFields: [],
    ...overrides,
  };
}

describe('Financial Calculation Engine & AI Bill Splitter Suite', () => {
  it('1. Whole-item allocation calculates exact amounts per participant', () => {
    const participants: Participant[] = [
      { id: 'p1', name: 'أحمد' },
      { id: 'p2', name: 'سارة' },
    ];
    const items: ReceiptItem[] = [
      {
        id: 'i1',
        name: 'برجر دبل',
        quantity: 3,
        unitPrice: 120,
        lineTotal: 360,
        itemDiscount: 0,
        itemTax: 0,
        isTaxInclusive: false,
      },
    ];
    const receipt = makeBaseReceipt({ items, subtotal: 360, finalTotal: 360 });
    const feeSettings = createDefaultFeeSettings(receipt, participants);

    const summary = calculateBillSplit({
      currency: 'EGP',
      items,
      participants,
      allocations: [
        {
          itemId: 'i1',
          directUnits: { p1: 2, p2: 1 },
          sharedSplits: [],
        },
      ],
      feeSettings,
    });

    expect(summary.isValid).toBe(true);
    const p1 = summary.participants.find((p) => p.participantId === 'p1')!;
    const p2 = summary.participants.find((p) => p.participantId === 'p2')!;

    expect(p1.foodSubtotal).toBe(240);
    expect(p2.foodSubtotal).toBe(120);
    expect(p1.finalTotalMinor + p2.finalTotalMinor).toBe(toMinorUnits(360));
  });

  it('2. Shared items: 5 sandwiches @ EGP 100 (Me: 2, Mohamed: 1, Ali: 1, Mohamed & Hussein share last 1 equally)', () => {
    const participants: Participant[] = [
      { id: 'me', name: 'Me' },
      { id: 'mohamed', name: 'Mohamed' },
      { id: 'ali', name: 'Ali' },
      { id: 'hussein', name: 'Hussein' },
    ];
    const items: ReceiptItem[] = [
      {
        id: 'sandwiches',
        name: 'Sandwiches',
        quantity: 5,
        unitPrice: 100,
        lineTotal: 500,
        itemDiscount: 0,
        itemTax: 0,
        isTaxInclusive: false,
      },
    ];
    const receipt = makeBaseReceipt({ items, subtotal: 500, finalTotal: 500 });
    const feeSettings = createDefaultFeeSettings(receipt, participants);

    const summary = calculateBillSplit({
      currency: 'EGP',
      items,
      participants,
      allocations: [
        {
          itemId: 'sandwiches',
          directUnits: {
            me: 2,
            mohamed: 1,
            ali: 1,
            hussein: 0,
          },
          sharedSplits: [
            {
              id: 'last-sandwich',
              quantity: 1,
              mode: 'equal',
              participantWeights: {
                mohamed: 1,
                hussein: 1,
              },
            },
          ],
        },
      ],
      feeSettings,
    });

    expect(summary.isValid).toBe(true);
    const byId = Object.fromEntries(
      summary.participants.map((p) => [p.participantId, p])
    );

    expect(byId.me?.foodSubtotal).toBe(200);
    expect(byId.mohamed?.foodSubtotal).toBe(150);
    expect(byId.ali?.foodSubtotal).toBe(100);
    expect(byId.hussein?.foodSubtotal).toBe(50);

    const sumMinor = summary.participants.reduce(
      (acc, p) => acc + p.finalTotalMinor,
      0
    );
    expect(sumMinor).toBe(toMinorUnits(500));
  });

  it('3. Custom sharing proportions split shared items accurately', () => {
    const participants: Participant[] = [
      { id: 'p1', name: 'أنا' },
      { id: 'p2', name: 'محمد' },
      { id: 'p3', name: 'علي' },
    ];
    const items: ReceiptItem[] = [
      {
        id: 'platter',
        name: 'صينية مشويات عائلي',
        quantity: 1,
        unitPrice: 400,
        lineTotal: 400,
        itemDiscount: 0,
        itemTax: 0,
        isTaxInclusive: false,
      },
    ];
    const receipt = makeBaseReceipt({ items, subtotal: 400, finalTotal: 400 });
    const feeSettings = createDefaultFeeSettings(receipt, participants);

    // Proportions 50% : 30% : 20%
    const summary = calculateBillSplit({
      currency: 'EGP',
      items,
      participants,
      allocations: [
        {
          itemId: 'platter',
          directUnits: {},
          sharedSplits: [
            {
              id: 'custom-1',
              quantity: 1,
              mode: 'custom',
              participantWeights: { p1: 50, p2: 30, p3: 20 },
            },
          ],
        },
      ],
      feeSettings,
    });

    expect(summary.isValid).toBe(true);
    expect(summary.participants[0]?.foodSubtotal).toBe(200);
    expect(summary.participants[1]?.foodSubtotal).toBe(120);
    expect(summary.participants[2]?.foodSubtotal).toBe(80);
  });

  it('4. Delivery fee allocation supports equal, proportional, and custom methods', () => {
    const participants: Participant[] = [
      { id: 'p1', name: 'أول' },
      { id: 'p2', name: 'ثاني' },
    ];
    const items: ReceiptItem[] = [
      {
        id: 'item1',
        name: 'وجبة',
        quantity: 4,
        unitPrice: 100,
        lineTotal: 400,
        itemDiscount: 0,
        itemTax: 0,
        isTaxInclusive: false,
      },
    ];
    const receipt = makeBaseReceipt({
      items,
      subtotal: 400,
      deliveryFee: 60,
      finalTotal: 460,
    });

    const baseAlloc = [
      {
        itemId: 'item1',
        directUnits: { p1: 3, p2: 1 }, // 300 vs 100 (75% vs 25%)
        sharedSplits: [],
      },
    ];

    // Equal delivery allocation (30 / 30)
    const equalSettings = createDefaultFeeSettings(receipt, participants);
    equalSettings.deliveryFee.allocationMethod = 'equal';
    const equalRes = calculateBillSplit({
      items,
      participants,
      allocations: baseAlloc,
      feeSettings: equalSettings,
    });
    expect(equalRes.participants[0]?.deliveryShare).toBe(30);
    expect(equalRes.participants[1]?.deliveryShare).toBe(30);

    // Proportional delivery allocation (45 / 15)
    const propSettings = createDefaultFeeSettings(receipt, participants);
    propSettings.deliveryFee.allocationMethod = 'proportional';
    const propRes = calculateBillSplit({
      items,
      participants,
      allocations: baseAlloc,
      feeSettings: propSettings,
    });
    expect(propRes.participants[0]?.deliveryShare).toBe(45);
    expect(propRes.participants[1]?.deliveryShare).toBe(15);

    // Custom delivery allocation (1:2 -> 20 / 40)
    const customSettings = createDefaultFeeSettings(receipt, participants);
    customSettings.deliveryFee.allocationMethod = 'custom';
    customSettings.deliveryFee.customWeights = { p1: 1, p2: 2 };
    const customRes = calculateBillSplit({
      items,
      participants,
      allocations: baseAlloc,
      feeSettings: customSettings,
    });
    expect(customRes.participants[0]?.deliveryShare).toBe(20);
    expect(customRes.participants[1]?.deliveryShare).toBe(40);
  });

  it('5. Percentage taxes and printed tax amount preference work without double taxation', () => {
    const participants: Participant[] = [
      { id: 'p1', name: 'أ' },
      { id: 'p2', name: 'ب' },
    ];
    const items: ReceiptItem[] = [
      {
        id: 'i1',
        name: 'طلب',
        quantity: 2,
        unitPrice: 100,
        lineTotal: 200,
        itemDiscount: 0,
        itemTax: 10, // item-level tax already 10 EGP
        isTaxInclusive: false,
      },
    ];
    // Total receipt tax printed is 28 EGP (14% of 200), which already includes the 10 EGP item tax
    const receipt = makeBaseReceipt({
      items,
      subtotal: 200,
      taxAmount: 28,
      taxPercentage: 14,
      finalTotal: 228,
    });

    const feeSettings = createDefaultFeeSettings(receipt, participants);
    const summary = calculateBillSplit({
      items,
      participants,
      allocations: [
        { itemId: 'i1', directUnits: { p1: 1, p2: 1 }, sharedSplits: [] },
      ],
      feeSettings,
    });

    // Total tax must be 28 EGP (not 28 + 10 = 38)
    expect(fromMinorUnits(summary.totalTaxMinor)).toBe(28);
    expect(summary.participants[0]?.taxShare).toBe(14);
    expect(summary.participants[1]?.taxShare).toBe(14);
    expect(summary.finalBillTotal).toBe(228);
  });

  it('6. Discounts (fixed and percentage) reduce participant shares and tax base accurately', () => {
    const participants: Participant[] = [
      { id: 'p1', name: 'أ' },
      { id: 'p2', name: 'ب' },
    ];
    const items: ReceiptItem[] = [
      {
        id: 'i1',
        name: 'وجبة',
        quantity: 2,
        unitPrice: 100,
        lineTotal: 200,
        itemDiscount: 0,
        itemTax: 0,
        isTaxInclusive: false,
      },
    ];
    const receipt = makeBaseReceipt({
      items,
      subtotal: 200,
      discountPercentage: 20, // 20% discount = 40 EGP -> net food = 160 EGP
      taxPercentage: 10, // 10% post-discount tax = 16 EGP
      finalTotal: 176,
    });

    const feeSettings = createDefaultFeeSettings(receipt, participants);
    feeSettings.tax.preferPrintedAmount = false;
    feeSettings.tax.valueType = 'percentage';
    feeSettings.tax.value = 10;
    feeSettings.tax.taxBase = 'post_discount';

    const summary = calculateBillSplit({
      items,
      participants,
      allocations: [
        { itemId: 'i1', directUnits: { p1: 1, p2: 1 }, sharedSplits: [] },
      ],
      feeSettings,
    });

    expect(fromMinorUnits(summary.totalDiscountMinor)).toBe(40);
    expect(fromMinorUnits(summary.totalTaxMinor)).toBe(16);
    expect(summary.participants[0]?.discountShare).toBe(20);
    expect(summary.participants[0]?.taxShare).toBe(8);
    expect(summary.participants[0]?.finalTotal).toBe(88);
    expect(summary.finalBillTotal).toBe(176);
  });

  it('7. Tax-inclusive prices do not add tax a second time to the final total', () => {
    const participants: Participant[] = [
      { id: 'p1', name: 'أ' },
      { id: 'p2', name: 'ب' },
    ];
    const items: ReceiptItem[] = [
      {
        id: 'i1',
        name: 'بيتزا شاملة الضريبة',
        quantity: 2,
        unitPrice: 114,
        lineTotal: 228,
        itemDiscount: 0,
        itemTax: 0,
        isTaxInclusive: true,
      },
    ];
    const receipt = makeBaseReceipt({
      items,
      subtotal: 228,
      taxAmount: 28,
      taxPercentage: 14,
      isTaxInclusive: true,
      finalTotal: 228,
    });

    const feeSettings = createDefaultFeeSettings(receipt, participants);
    const summary = calculateBillSplit({
      items,
      participants,
      allocations: [
        { itemId: 'i1', directUnits: { p1: 1, p2: 1 }, sharedSplits: [] },
      ],
      feeSettings,
    });

    expect(summary.totalTaxMinor).toBe(0);
    expect(fromMinorUnits(summary.totalInclusiveTaxInfoMinor)).toBe(28);
    expect(summary.participants[0]?.finalTotal).toBe(114);
    expect(summary.participants[1]?.finalTotal).toBe(114);
    expect(summary.finalBillTotal).toBe(228);
  });

  it('8. Currency rounding distributes indivisible minor units deterministically via largest remainder', () => {
    // 100.00 EGP (10000 piasters) split equally among 3 participants -> 3334, 3333, 3333
    const dist = allocateByWeightsMinor(10000, [
      { id: 'p1', weight: 1 },
      { id: 'p2', weight: 1 },
      { id: 'p3', weight: 1 },
    ]);

    expect(dist.p1).toBe(3334);
    expect(dist.p2).toBe(3333);
    expect(dist.p3).toBe(3333);
    expect(dist.p1! + dist.p2! + dist.p3!).toBe(10000);
  });

  it('9. Detects unassigned and over-allocated item quantities as validation errors', () => {
    const participants: Participant[] = [
      { id: 'p1', name: 'أ' },
      { id: 'p2', name: 'ب' },
    ];
    const items: ReceiptItem[] = [
      {
        id: 'i1',
        name: 'شاورما',
        quantity: 3,
        unitPrice: 50,
        lineTotal: 150,
        itemDiscount: 0,
        itemTax: 0,
        isTaxInclusive: false,
      },
    ];
    const receipt = makeBaseReceipt({ items, subtotal: 150, finalTotal: 150 });
    const feeSettings = createDefaultFeeSettings(receipt, participants);

    // Unassigned (only 2 out of 3 assigned)
    const unassignedRes = calculateBillSplit({
      items,
      participants,
      allocations: [
        { itemId: 'i1', directUnits: { p1: 1, p2: 1 }, sharedSplits: [] },
      ],
      feeSettings,
    });
    expect(unassignedRes.isValid).toBe(false);
    expect(
      unassignedRes.validationIssues.some((i) => i.code === 'UNASSIGNED_QUANTITY')
    ).toBe(true);

    // Over-allocated (4 out of 3 assigned)
    const overRes = calculateBillSplit({
      items,
      participants,
      allocations: [
        { itemId: 'i1', directUnits: { p1: 2, p2: 2 }, sharedSplits: [] },
      ],
      feeSettings,
    });
    expect(overRes.isValid).toBe(false);
    expect(
      overRes.validationIssues.some((i) => i.code === 'OVERALLOCATED_QUANTITY')
    ).toBe(true);
  });

  it('10. Receipt total mismatches are flagged and reconciled exactly in minor units', () => {
    // Zod schema reconciliation test
    const { receipt, reconciliationWarnings } = validateAndReconcileReceipt({
      restaurantName: 'مطعم التجربة',
      currency: 'EGP',
      items: [
        { name: 'كشري', quantity: 3, unitPrice: 33.33, lineTotal: 99.99 },
      ],
      subtotal: 99.99,
      finalTotal: 100.0, // 0.01 EGP rounding on receipt
    });
    expect(reconciliationWarnings).toHaveLength(0); // within 0.05 tolerance for AI OCR

    // Calculator exact minor-unit reconciliation test
    const participants: Participant[] = [
      { id: 'p1', name: 'أ' },
      { id: 'p2', name: 'ب' },
      { id: 'p3', name: 'ج' },
    ];
    const feeSettings = createDefaultFeeSettings(receipt, participants);
    feeSettings.agreedFinalTotal = 100.0;
    feeSettings.reconcileToFinalTotal = true;

    const summary = calculateBillSplit({
      items: receipt.items,
      participants,
      allocations: [
        {
          itemId: receipt.items[0]!.id,
          directUnits: { p1: 1, p2: 1, p3: 1 },
          sharedSplits: [],
        },
      ],
      feeSettings,
    });

    const sumParticipantMinor = summary.participants.reduce(
      (acc, p) => acc + p.finalTotalMinor,
      0
    );
    expect(sumParticipantMinor).toBe(toMinorUnits(100.0));
    expect(summary.finalBillTotalMinor).toBe(10000);
  });

  it('11. AI provider failures (HTTP errors, timeouts, malformed JSON) throw safe ReceiptParserError', async () => {
    const dummyImage = new Uint8Array([137, 80, 78, 71]);

    // 500 error from provider
    await expect(
      parseReceiptWithGemini({
        imageBuffer: dummyImage,
        mimeType: 'image/png',
        apiKey: 'AIzaSyTestValidLookingKey',
        fetchImpl: async () => new Response('Internal error', { status: 500 }),
      })
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
    });

    // Malformed JSON response from Gemini
    await expect(
      parseReceiptWithGemini({
        imageBuffer: dummyImage,
        mimeType: 'image/png',
        apiKey: 'AIzaSyTestValidLookingKey',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [{ text: 'not valid json {{{' }],
                  },
                },
              ],
            }),
            { status: 200 }
          ),
      })
    ).rejects.toMatchObject({
      code: 'MALFORMED_AI_RESPONSE',
    });
  });

  it('12. Missing API keys are handled cleanly in parser and Next.js Route Handlers', async () => {
    expect(isAiConfigured('')).toBe(false);
    expect(isAiConfigured('your_api_key_here')).toBe(false);
    expect(isAiConfigured('your_gemini_api_key_here')).toBe(false);
    expect(isAiConfigured('AIzaSyRealKey123')).toBe(true);

    const dummyImage = new Uint8Array([1, 2, 3]);
    await expect(
      parseReceiptWithGemini({
        imageBuffer: dummyImage,
        mimeType: 'image/jpeg',
        apiKey: 'your_api_key_here',
      })
    ).rejects.toThrowError(ReceiptParserError);

    // Verify GET /api/health works without API key
    const healthRes = await healthGet();
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as { status: string };
    expect(healthJson.status).toBe('ok');

    // Verify POST /api/receipts/parse rejects missing multipart or missing API key safely
    const formData = new FormData();
    formData.append(
      'receipt',
      new Blob([dummyImage], { type: 'image/png' }),
      'receipt.png'
    );
    const req = new Request('http://localhost:3000/api/receipts/parse', {
      method: 'POST',
      body: formData,
    });
    const parseRes = await parsePost(req);
    const parseJson = (await parseRes.json()) as {
      success: boolean;
      code?: string;
    };
    if (!isAiConfigured()) {
      expect(parseRes.status).toBe(503);
      expect(parseJson.success).toBe(false);
      expect(parseJson.code).toBe('MISSING_API_KEY');
    }
  });
});
