import { z } from 'zod';
import type { ReceiptData, ReceiptItem, UncertainField } from '@ehsebhaly/types';

export const UncertainFieldSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
  suggestedValue: z.union([z.string(), z.number(), z.null()]).optional(),
});

export const ReceiptItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'اسم الصنف مطلوب'),
  quantity: z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unitPrice: z.number().nonnegative('سعر الوحدة لا يمكن أن يكون سالباً'),
  lineTotal: z.number().nonnegative('إجمالي الصنف لا يمكن أن يكون سالباً').optional(),
  itemDiscount: z.number().nonnegative().optional().default(0),
  itemTax: z.number().nonnegative().optional().default(0),
  isTaxInclusive: z.boolean().optional().default(false),
  uncertain: z.boolean().optional().default(false),
  uncertaintyNote: z.string().optional(),
});

export const AIExtractedReceiptSchema = z.object({
  restaurantName: z.string().optional().default('مطعم غير محدد'),
  currency: z.string().min(1).optional().default('EGP'),
  items: z.array(ReceiptItemSchema).default([]),
  subtotal: z.number().nonnegative().optional().default(0),
  discountAmount: z.number().nonnegative().optional().default(0),
  discountPercentage: z.number().min(0).max(100).nullable().optional().default(null),
  taxAmount: z.number().nonnegative().optional().default(0),
  taxPercentage: z.number().min(0).max(100).nullable().optional().default(null),
  isTaxInclusive: z.boolean().optional().default(false),
  serviceChargeAmount: z.number().nonnegative().optional().default(0),
  serviceChargePercentage: z.number().min(0).max(100).nullable().optional().default(null),
  deliveryFee: z.number().nonnegative().optional().default(0),
  otherFees: z.number().nonnegative().optional().default(0),
  roundingAdjustment: z.number().optional().default(0),
  finalTotal: z.number().nonnegative().optional().default(0),
  uncertainFields: z.array(UncertainFieldSchema).optional().default([]),
});

export type AIExtractedReceiptInput = z.input<typeof AIExtractedReceiptSchema>;

/**
 * Independently reconciles AI-extracted receipt values without blindly trusting AI totals.
 * Flags discrepancies in `uncertainFields` and item `uncertain` markers for user review.
 */
export function validateAndReconcileReceipt(rawInput: unknown): {
  receipt: ReceiptData;
  reconciliationWarnings: string[];
} {
  const parsed = AIExtractedReceiptSchema.parse(rawInput);
  const warnings: string[] = [];
  const uncertainFields: UncertainField[] = [...parsed.uncertainFields];

  const round2 = (n: number): number => Math.round(n * 100) / 100;

  const items: ReceiptItem[] = parsed.items.map((item, idx) => {
    const computedLineTotal = round2(item.quantity * item.unitPrice);
    const hasProvidedLineTotal = typeof item.lineTotal === 'number' && item.lineTotal > 0;
    const effectiveLineTotal = hasProvidedLineTotal ? round2(item.lineTotal!) : computedLineTotal;

    let uncertain = Boolean(item.uncertain);
    let uncertaintyNote = item.uncertaintyNote;

    if (hasProvidedLineTotal && Math.abs(computedLineTotal - effectiveLineTotal) > 0.05) {
      uncertain = true;
      const msg = `عدم تطابق في الصنف "${item.name}": (${item.quantity} × ${item.unitPrice} = ${computedLineTotal}) بينما الإجمالي المسجل ${effectiveLineTotal}`;
      uncertaintyNote = uncertaintyNote ? `${uncertaintyNote} | ${msg}` : msg;
      warnings.push(msg);
      uncertainFields.push({
        field: `items[${idx}].lineTotal`,
        reason: msg,
        suggestedValue: computedLineTotal,
      });
    }

    return {
      id: item.id && item.id.trim().length > 0 ? item.id : `item-${idx + 1}`,
      name: item.name.trim(),
      quantity: item.quantity,
      unitPrice: round2(item.unitPrice),
      lineTotal: effectiveLineTotal,
      itemDiscount: round2(item.itemDiscount ?? 0),
      itemTax: round2(item.itemTax ?? 0),
      isTaxInclusive: Boolean(item.isTaxInclusive),
      uncertain,
      uncertaintyNote,
    };
  });

  const computedItemsSubtotal = round2(
    items.reduce((acc, item) => acc + item.lineTotal, 0)
  );
  const computedItemDiscounts = round2(
    items.reduce((acc, item) => acc + item.itemDiscount, 0)
  );
  const computedItemTaxes = round2(
    items.reduce((acc, item) => acc + (item.isTaxInclusive ? 0 : item.itemTax), 0)
  );

  let subtotal = round2(parsed.subtotal);
  if (subtotal === 0 && computedItemsSubtotal > 0) {
    subtotal = computedItemsSubtotal;
  } else if (Math.abs(subtotal - computedItemsSubtotal) > 0.05) {
    const msg = `المجموع الفرعي المستخرج (${subtotal}) لا يطابق مجموع الأصناف المحسوب (${computedItemsSubtotal}). يرجى المراجعة.`;
    warnings.push(msg);
    uncertainFields.push({
      field: 'subtotal',
      reason: msg,
      suggestedValue: computedItemsSubtotal,
    });
  }

  const discountAmount = round2(parsed.discountAmount);
  const taxAmount = round2(parsed.taxAmount);
  const serviceChargeAmount = round2(parsed.serviceChargeAmount);
  const deliveryFee = round2(parsed.deliveryFee);
  const otherFees = round2(parsed.otherFees);
  const roundingAdjustment = round2(parsed.roundingAdjustment);

  const additiveTax = parsed.isTaxInclusive ? 0 : taxAmount;
  const computedFinalTotal = round2(
    computedItemsSubtotal -
      computedItemDiscounts -
      discountAmount +
      computedItemTaxes +
      additiveTax +
      serviceChargeAmount +
      deliveryFee +
      otherFees +
      roundingAdjustment
  );

  let finalTotal = round2(parsed.finalTotal);
  if (finalTotal === 0 && computedFinalTotal > 0) {
    finalTotal = computedFinalTotal;
  } else if (Math.abs(finalTotal - computedFinalTotal) > 0.05) {
    const msg = `الإجمالي النهائي في الفاتورة (${finalTotal}) يختلف عن مجموع البنود المحسوب (${computedFinalTotal}) بفارق ${round2(finalTotal - computedFinalTotal)}.`;
    warnings.push(msg);
    uncertainFields.push({
      field: 'finalTotal',
      reason: msg,
      suggestedValue: computedFinalTotal,
    });
  }

  return {
    receipt: {
      restaurantName: parsed.restaurantName.trim() || 'مطعم غير محدد',
      currency: parsed.currency.trim().toUpperCase() || 'EGP',
      items,
      subtotal,
      discountAmount,
      discountPercentage: parsed.discountPercentage,
      taxAmount,
      taxPercentage: parsed.taxPercentage,
      isTaxInclusive: parsed.isTaxInclusive,
      serviceChargeAmount,
      serviceChargePercentage: parsed.serviceChargePercentage,
      deliveryFee,
      otherFees,
      roundingAdjustment,
      finalTotal,
      uncertainFields,
    },
    reconciliationWarnings: warnings,
  };
}
