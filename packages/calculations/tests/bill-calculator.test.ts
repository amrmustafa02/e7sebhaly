import { describe, it, expect } from 'vitest';
import {
  allocateByWeightsMinor,
  calculateBillSplit,
  createDefaultFeeSettings,
  toMinorUnits,
} from '../src';
import type { Participant, ReceiptData, ReceiptItem } from '@ehsebhaly/types';

describe('@ehsebhaly/calculations unit tests', () => {
  it('reconciles 5 sandwiches shared scenario in exact minor units', () => {
    const participants: Participant[] = [
      { id: 'me', name: 'Me' },
      { id: 'mohamed', name: 'Mohamed' },
      { id: 'ali', name: 'Ali' },
      { id: 'hussein', name: 'Hussein' },
    ];
    const items: ReceiptItem[] = [
      {
        id: 's1',
        name: 'Sandwich',
        quantity: 5,
        unitPrice: 100,
        lineTotal: 500,
        itemDiscount: 0,
        itemTax: 0,
        isTaxInclusive: false,
      },
    ];
    const receipt: ReceiptData = {
      restaurantName: 'Test',
      currency: 'EGP',
      items,
      subtotal: 500,
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
      finalTotal: 500,
      uncertainFields: [],
    };

    const result = calculateBillSplit({
      items,
      participants,
      allocations: [
        {
          itemId: 's1',
          directUnits: { me: 2, mohamed: 1, ali: 1 },
          sharedSplits: [
            {
              id: 'sh1',
              quantity: 1,
              mode: 'equal',
              participantWeights: { mohamed: 1, hussein: 1 },
            },
          ],
        },
      ],
      feeSettings: createDefaultFeeSettings(receipt, participants),
    });

    expect(result.isValid).toBe(true);
    expect(result.finalBillTotalMinor).toBe(toMinorUnits(500));
    expect(
      result.participants.reduce((sum, p) => sum + p.finalTotalMinor, 0)
    ).toBe(result.finalBillTotalMinor);
  });

  it('allocates indivisible minor units deterministically using largest remainder', () => {
    const shares = allocateByWeightsMinor(100, [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1 },
      { id: 'c', weight: 1 },
    ]);
    expect(shares).toEqual({ a: 34, b: 33, c: 33 });
  });
});
