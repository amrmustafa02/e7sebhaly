import type {
  AllocationMethod,
  BillCalculationSummary,
  ChargeConfig,
  FeeSettingsConfig,
  ItemAllocationEntry,
  MinorUnits,
  Participant,
  ParticipantCalculationResult,
  ParticipantItemBreakdown,
  ReceiptData,
  ReceiptItem,
  ValidationIssue,
} from '@ehsebhaly/types';

export const DEFAULT_MINOR_UNIT_SCALE = 100;

/**
 * Converts a major currency decimal number (e.g. 125.50 EGP) into integer minor units (12550 piasters).
 * Uses EPSILON-adjusted half-away-from-zero rounding to avoid floating-point representation drift.
 */
export function toMinorUnits(
  amountMajor: number,
  scale: number = DEFAULT_MINOR_UNIT_SCALE
): MinorUnits {
  if (!Number.isFinite(amountMajor)) {
    return 0;
  }
  const sign = amountMajor < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(amountMajor) + Number.EPSILON) * scale);
}

/**
 * Converts integer minor units back to major currency units for display.
 */
export function fromMinorUnits(
  amountMinor: MinorUnits,
  scale: number = DEFAULT_MINOR_UNIT_SCALE
): number {
  if (amountMinor === 0) return 0;
  return amountMinor / scale;
}

/**
 * Computes a percentage of an integer minor unit base using integer basis points (100% = 10000 bps).
 * Uses half-up integer rounding: floor((base * bps + 5000) / 10000).
 */
export function computePercentageMinor(
  baseMinor: MinorUnits,
  percentage: number
): MinorUnits {
  if (baseMinor === 0 || percentage <= 0 || !Number.isFinite(percentage)) {
    return 0;
  }
  const sign = baseMinor < 0 ? -1 : 1;
  const absBase = Math.abs(baseMinor);
  const bps = Math.round((percentage + Number.EPSILON) * 100);
  const numerator = absBase * bps + 5000;
  return sign * Math.floor(numerator / 10000);
}

/**
 * Computes the embedded tax inside a tax-inclusive amount:
 * embeddedTax = amount * rate / (100 + rate)
 */
export function computeEmbeddedTaxMinor(
  inclusiveAmountMinor: MinorUnits,
  percentage: number
): MinorUnits {
  if (inclusiveAmountMinor <= 0 || percentage <= 0 || !Number.isFinite(percentage)) {
    return 0;
  }
  const bps = Math.round((percentage + Number.EPSILON) * 100);
  const denominator = 10000 + bps;
  return Math.floor((inclusiveAmountMinor * bps + Math.floor(denominator / 2)) / denominator);
}

export interface WeightedTarget {
  id: string;
  weight: number;
}

/**
 * Deterministic Largest-Remainder (Hamilton Method) allocation of integer minor units.
 *
 * Guarantees:
 * 1. Every recipient receives an integer number of minor units.
 * 2. The sum of allocated minor units equals `totalMinor` exactly.
 * 3. Indivisible remainder units (1 minor unit each) are distributed in descending order
 *    of exact fractional remainder, with original array index as a deterministic tie-breaker.
 */
export function allocateByWeightsMinor(
  totalMinor: MinorUnits,
  targets: readonly WeightedTarget[]
): Record<string, MinorUnits> {
  const result: Record<string, MinorUnits> = {};
  for (const t of targets) {
    result[t.id] = 0;
  }

  if (totalMinor === 0 || targets.length === 0) {
    return result;
  }

  const activeTargets = targets
    .map((t, index) => ({
      id: t.id,
      weight: t.weight > 0 && Number.isFinite(t.weight) ? t.weight : 0,
      index,
    }))
    .filter((t) => t.weight > 0);

  if (activeTargets.length === 0) {
    return result;
  }

  const sign = totalMinor < 0 ? -1 : 1;
  const absTotal = Math.abs(totalMinor);

  // Convert weights to scaled integers to avoid floating-point division drift
  const WEIGHT_SCALE = 1_000_000;
  const scaledWeights = activeTargets.map((t) => ({
    ...t,
    scaledWeight: Math.max(1, Math.round(t.weight * WEIGHT_SCALE)),
  }));

  const totalScaledWeight = scaledWeights.reduce((acc, t) => acc + t.scaledWeight, 0);

  let allocatedSum = 0;
  const quotas = scaledWeights.map((t) => {
    const numerator = BigInt(absTotal) * BigInt(t.scaledWeight);
    const denom = BigInt(totalScaledWeight);
    const floorQuota = Number(numerator / denom);
    const remainder = numerator % denom;
    allocatedSum += floorQuota;
    return {
      id: t.id,
      index: t.index,
      floorQuota,
      remainder,
    };
  });

  const remainderUnits = absTotal - allocatedSum;

  // Sort by largest remainder descending; tie-break deterministically by original participant order
  const sortedForRemainder = [...quotas].sort((a, b) => {
    if (b.remainder > a.remainder) return 1;
    if (b.remainder < a.remainder) return -1;
    return a.index - b.index;
  });

  for (let i = 0; i < remainderUnits && i < sortedForRemainder.length; i++) {
    const target = sortedForRemainder[i];
    if (target) {
      target.floorQuota += 1;
    }
  }

  for (const q of quotas) {
    result[q.id] = sign * q.floorQuota;
  }

  return result;
}

/**
 * Helper to build weights for a charge allocation method.
 */
function buildAllocationWeights(
  method: AllocationMethod,
  participants: readonly Participant[],
  proportionalBasesMinor: Record<string, MinorUnits>,
  customWeights?: Record<string, number>
): WeightedTarget[] {
  if (method === 'equal') {
    return participants.map((p) => ({ id: p.id, weight: 1 }));
  }

  if (method === 'custom') {
    return participants.map((p) => ({
      id: p.id,
      weight: Math.max(0, customWeights?.[p.id] ?? 0),
    }));
  }

  // 'proportional': use participant's food base; if all food bases are 0, fall back to equal
  const totalBase = participants.reduce(
    (acc, p) => acc + Math.max(0, proportionalBasesMinor[p.id] ?? 0),
    0
  );
  if (totalBase <= 0) {
    return participants.map((p) => ({ id: p.id, weight: 1 }));
  }

  return participants.map((p) => ({
    id: p.id,
    weight: Math.max(0, proportionalBasesMinor[p.id] ?? 0),
  }));
}

/**
 * Resolves the minor-unit amount for a configurable charge (discount, service charge, delivery, other).
 */
function resolveChargeAmountMinor(
  config: ChargeConfig,
  baseMinor: MinorUnits,
  scale: number
): MinorUnits {
  if (!config.enabled) {
    return 0;
  }
  if (
    config.preferPrintedAmount &&
    typeof config.printedAmount === 'number' &&
    config.printedAmount > 0
  ) {
    return toMinorUnits(config.printedAmount, scale);
  }
  if (config.valueType === 'percentage') {
    return computePercentageMinor(baseMinor, config.value);
  }
  return toMinorUnits(config.value, scale);
}

/**
 * Creates default FeeSettingsConfig from an extracted or manual ReceiptData object.
 */
export function createDefaultFeeSettings(
  receipt: ReceiptData,
  participants: readonly Participant[] = []
): FeeSettingsConfig {
  const defaultCustomWeights: Record<string, number> = {};
  for (const p of participants) {
    defaultCustomWeights[p.id] = 1;
  }

  const hasDiscount =
    receipt.discountAmount > 0 ||
    (receipt.discountPercentage !== null && receipt.discountPercentage > 0);
  const hasTax =
    receipt.taxAmount > 0 ||
    (receipt.taxPercentage !== null && receipt.taxPercentage > 0);
  const hasService =
    receipt.serviceChargeAmount > 0 ||
    (receipt.serviceChargePercentage !== null && receipt.serviceChargePercentage > 0);

  return {
    discount: {
      enabled: hasDiscount,
      valueType:
        receipt.discountAmount > 0
          ? 'fixed'
          : receipt.discountPercentage
            ? 'percentage'
            : 'fixed',
      value:
        receipt.discountAmount > 0
          ? receipt.discountAmount
          : (receipt.discountPercentage ?? 0),
      printedAmount: receipt.discountAmount > 0 ? receipt.discountAmount : null,
      preferPrintedAmount: receipt.discountAmount > 0,
      allocationMethod: 'equal',
      customWeights: { ...defaultCustomWeights },
    },
    tax: {
      enabled: hasTax,
      valueType:
        receipt.taxAmount > 0
          ? 'fixed'
          : receipt.taxPercentage
            ? 'percentage'
            : 'fixed',
      value:
        receipt.taxAmount > 0
          ? receipt.taxAmount
          : (receipt.taxPercentage ?? 0),
      printedAmount: receipt.taxAmount > 0 ? receipt.taxAmount : null,
      preferPrintedAmount: receipt.taxAmount > 0,
      isTaxInclusive: receipt.isTaxInclusive,
      taxBase: 'post_discount',
      allocationMethod: 'equal',
      customWeights: { ...defaultCustomWeights },
    },
    serviceCharge: {
      enabled: hasService,
      valueType:
        receipt.serviceChargeAmount > 0
          ? 'fixed'
          : receipt.serviceChargePercentage
            ? 'percentage'
            : 'fixed',
      value:
        receipt.serviceChargeAmount > 0
          ? receipt.serviceChargeAmount
          : (receipt.serviceChargePercentage ?? 0),
      printedAmount:
        receipt.serviceChargeAmount > 0 ? receipt.serviceChargeAmount : null,
      preferPrintedAmount: receipt.serviceChargeAmount > 0,
      taxBase: 'post_discount',
      allocationMethod: 'equal',
      customWeights: { ...defaultCustomWeights },
    },
    deliveryFee: {
      enabled: receipt.deliveryFee > 0,
      valueType: 'fixed',
      value: receipt.deliveryFee,
      printedAmount: receipt.deliveryFee > 0 ? receipt.deliveryFee : null,
      preferPrintedAmount: true,
      allocationMethod: 'equal',
      customWeights: { ...defaultCustomWeights },
    },
    otherFees: {
      enabled: receipt.otherFees > 0,
      valueType: 'fixed',
      value: receipt.otherFees,
      printedAmount: receipt.otherFees > 0 ? receipt.otherFees : null,
      preferPrintedAmount: true,
      allocationMethod: 'equal',
      customWeights: { ...defaultCustomWeights },
    },
    roundingAdjustment: receipt.roundingAdjustment,
    adjustmentAllocationMethod: 'equal',
    reconcileToFinalTotal: false,
    agreedFinalTotal: receipt.finalTotal,
  };
}

export interface CalculateBillInput {
  currency?: string;
  minorUnitScale?: number;
  items: readonly ReceiptItem[];
  participants: readonly Participant[];
  allocations: readonly ItemAllocationEntry[];
  feeSettings: FeeSettingsConfig;
}

const QTY_EPSILON = 1e-6;

/**
 * Pure TypeScript deterministic financial calculation engine.
 * Operates in integer minor currency units and reconciles participant shares cleanly.
 */
export function calculateBillSplit(input: CalculateBillInput): BillCalculationSummary {
  const scale = input.minorUnitScale ?? DEFAULT_MINOR_UNIT_SCALE;
  const currency = input.currency?.trim().toUpperCase() || 'EGP';
  const { items, participants, allocations, feeSettings } = input;
  const validationIssues: ValidationIssue[] = [];

  if (participants.length === 0) {
    validationIssues.push({
      code: 'NO_PARTICIPANTS',
      severity: 'error',
      message: 'يجب إضافة مشارك واحد على الأقل لتقسيم الفاتورة.',
    });
  }

  if (items.length === 0) {
    validationIssues.push({
      code: 'NO_ITEMS',
      severity: 'error',
      message: 'يجب إضافة صنف واحد على الأقل في الفاتورة.',
    });
  }

  const participantItemsMap: Record<string, ParticipantItemBreakdown[]> = {};
  const grossFoodByParticipant: Record<string, MinorUnits> = {};
  const itemDiscountByParticipant: Record<string, MinorUnits> = {};
  const itemAdditiveTaxByParticipant: Record<string, MinorUnits> = {};
  const itemInclusiveTaxByParticipant: Record<string, MinorUnits> = {};

  for (const p of participants) {
    participantItemsMap[p.id] = [];
    grossFoodByParticipant[p.id] = 0;
    itemDiscountByParticipant[p.id] = 0;
    itemAdditiveTaxByParticipant[p.id] = 0;
    itemInclusiveTaxByParticipant[p.id] = 0;
  }

  let totalFoodMinor: MinorUnits = 0;
  let totalItemDiscountMinor: MinorUnits = 0;
  let totalItemAdditiveTaxMinor: MinorUnits = 0;
  let totalItemInclusiveTaxMinor: MinorUnits = 0;

  // Step 1: Process each item and its allocations
  for (const item of items) {
    if (item.unitPrice < 0 || item.lineTotal < 0) {
      validationIssues.push({
        code: 'NEGATIVE_PRICE',
        severity: 'error',
        itemId: item.id,
        message: `السعر للصنف "${item.name}" لا يمكن أن يكون سالباً.`,
      });
    }

    if (item.quantity <= 0) {
      validationIssues.push({
        code: 'NEGATIVE_QUANTITY',
        severity: 'error',
        itemId: item.id,
        message: `كمية الصنف "${item.name}" يجب أن تكون أكبر من صفر.`,
      });
      continue;
    }

    const expectedLineMinor = toMinorUnits(item.quantity * item.unitPrice, scale);
    const grossItemMinor =
      item.lineTotal > 0 ? toMinorUnits(item.lineTotal, scale) : expectedLineMinor;
    const itemDiscountMinor = Math.min(
      grossItemMinor,
      Math.max(0, toMinorUnits(item.itemDiscount, scale))
    );
    const itemTaxMinor = Math.max(0, toMinorUnits(item.itemTax, scale));
    const itemIsTaxInclusive = Boolean(item.isTaxInclusive || feeSettings.tax.isTaxInclusive);

    totalFoodMinor += grossItemMinor;
    totalItemDiscountMinor += itemDiscountMinor;
    if (itemIsTaxInclusive) {
      totalItemInclusiveTaxMinor += itemTaxMinor;
    } else {
      totalItemAdditiveTaxMinor += itemTaxMinor;
    }

    const alloc = allocations.find((a) => a.itemId === item.id);

    // Collect slices for this item: each direct participant unit assignment is a slice,
    // and each sharedSplit is a slice.
    interface ItemSlice {
      sliceId: string;
      quantity: number;
      participantWeights: WeightedTarget[];
    }

    const slices: ItemSlice[] = [];
    let allocatedQty = 0;

    if (alloc) {
      for (const p of participants) {
        const directQty = alloc.directUnits[p.id] ?? 0;
        if (directQty < -QTY_EPSILON) {
          validationIssues.push({
            code: 'NEGATIVE_QUANTITY',
            severity: 'error',
            itemId: item.id,
            participantId: p.id,
            message: `الكمية المخصصة للمشارك "${p.name}" في الصنف "${item.name}" لا يمكن أن تكون سالبة.`,
          });
        } else if (directQty > QTY_EPSILON) {
          allocatedQty += directQty;
          slices.push({
            sliceId: `direct-${p.id}`,
            quantity: directQty,
            participantWeights: [{ id: p.id, weight: 1 }],
          });
        }
      }

      for (const split of alloc.sharedSplits) {
        if (split.quantity < -QTY_EPSILON) {
          validationIssues.push({
            code: 'NEGATIVE_QUANTITY',
            severity: 'error',
            itemId: item.id,
            message: `كمية المشاركة في الصنف "${item.name}" لا يمكن أن تكون سالبة.`,
          });
          continue;
        }
        if (split.quantity <= QTY_EPSILON) {
          continue;
        }

        const weights: WeightedTarget[] = [];
        for (const p of participants) {
          const rawW = split.participantWeights[p.id] ?? 0;
          if (rawW > 0) {
            weights.push({
              id: p.id,
              weight: split.mode === 'equal' ? 1 : rawW,
            });
          }
        }

        if (weights.length === 0) {
          validationIssues.push({
            code: 'EMPTY_SHARED_SPLIT',
            severity: 'error',
            itemId: item.id,
            message: `يوجد تقسيم مشترك للصنف "${item.name}" بدون اختيار أي مشاركين.`,
          });
          continue;
        }

        allocatedQty += split.quantity;
        slices.push({
          sliceId: `split-${split.id}`,
          quantity: split.quantity,
          participantWeights: weights,
        });
      }
    }

    const diffQty = allocatedQty - item.quantity;
    if (diffQty < -QTY_EPSILON) {
      const remaining = Math.round((item.quantity - allocatedQty) * 1000) / 1000;
      validationIssues.push({
        code: 'UNASSIGNED_QUANTITY',
        severity: 'error',
        itemId: item.id,
        message: `الصنف "${item.name}" يحتوي على كمية غير مخصصة (${remaining} من أصل ${item.quantity}).`,
      });
    } else if (diffQty > QTY_EPSILON) {
      const excess = Math.round((allocatedQty - item.quantity) * 1000) / 1000;
      validationIssues.push({
        code: 'OVERALLOCATED_QUANTITY',
        severity: 'error',
        itemId: item.id,
        message: `الصنف "${item.name}" مخصص بكمية زائدة (${allocatedQty} من أصل ${item.quantity}، بزيادة ${excess}).`,
      });
    }

    if (slices.length > 0 && participants.length > 0) {
      // Allocate the item's gross, discount, and tax across slices first by slice quantity,
      // then within each slice across its participants by their weights.
      const sliceTargets: WeightedTarget[] = slices.map((s) => ({
        id: s.sliceId,
        weight: s.quantity,
      }));

      const sliceGrossMap = allocateByWeightsMinor(grossItemMinor, sliceTargets);
      const sliceDiscountMap = allocateByWeightsMinor(itemDiscountMinor, sliceTargets);
      const sliceTaxMap = allocateByWeightsMinor(itemTaxMinor, sliceTargets);

      const itemGrossPerParticipant: Record<string, MinorUnits> = {};
      const itemDiscountPerParticipant: Record<string, MinorUnits> = {};
      const itemTaxPerParticipant: Record<string, MinorUnits> = {};
      const effectiveQtyPerParticipant: Record<string, number> = {};

      for (const p of participants) {
        itemGrossPerParticipant[p.id] = 0;
        itemDiscountPerParticipant[p.id] = 0;
        itemTaxPerParticipant[p.id] = 0;
        effectiveQtyPerParticipant[p.id] = 0;
      }

      for (const slice of slices) {
        const sGross = sliceGrossMap[slice.sliceId] ?? 0;
        const sDiscount = sliceDiscountMap[slice.sliceId] ?? 0;
        const sTax = sliceTaxMap[slice.sliceId] ?? 0;

        const pGrossMap = allocateByWeightsMinor(sGross, slice.participantWeights);
        const pDiscountMap = allocateByWeightsMinor(sDiscount, slice.participantWeights);
        const pTaxMap = allocateByWeightsMinor(sTax, slice.participantWeights);

        const totalSliceWeight = slice.participantWeights.reduce(
          (acc, w) => acc + w.weight,
          0
        );

        for (const w of slice.participantWeights) {
          itemGrossPerParticipant[w.id] =
            (itemGrossPerParticipant[w.id] ?? 0) + (pGrossMap[w.id] ?? 0);
          itemDiscountPerParticipant[w.id] =
            (itemDiscountPerParticipant[w.id] ?? 0) + (pDiscountMap[w.id] ?? 0);
          itemTaxPerParticipant[w.id] =
            (itemTaxPerParticipant[w.id] ?? 0) + (pTaxMap[w.id] ?? 0);
          if (totalSliceWeight > 0) {
            effectiveQtyPerParticipant[w.id] =
              (effectiveQtyPerParticipant[w.id] ?? 0) +
              (slice.quantity * w.weight) / totalSliceWeight;
          }
        }
      }

      for (const p of participants) {
        const pGross = itemGrossPerParticipant[p.id] ?? 0;
        const pDisc = itemDiscountPerParticipant[p.id] ?? 0;
        const pTax = itemTaxPerParticipant[p.id] ?? 0;
        const effQty = Math.round((effectiveQtyPerParticipant[p.id] ?? 0) * 10000) / 10000;

        if (effQty > 0 || pGross > 0) {
          grossFoodByParticipant[p.id] = (grossFoodByParticipant[p.id] ?? 0) + pGross;
          itemDiscountByParticipant[p.id] = (itemDiscountByParticipant[p.id] ?? 0) + pDisc;
          if (itemIsTaxInclusive) {
            itemInclusiveTaxByParticipant[p.id] =
              (itemInclusiveTaxByParticipant[p.id] ?? 0) + pTax;
          } else {
            itemAdditiveTaxByParticipant[p.id] =
              (itemAdditiveTaxByParticipant[p.id] ?? 0) + pTax;
          }

          participantItemsMap[p.id]?.push({
            itemId: item.id,
            itemName: item.name,
            effectiveQuantity: effQty,
            grossAmountMinor: pGross,
            itemDiscountMinor: pDisc,
            itemTaxMinor: pTax,
            netFoodMinor: pGross - pDisc,
          });
        }
      }
    }
  }

  // Validate custom weights when any enabled charge uses 'custom' allocation
  const validateCustomChargeWeights = (config: ChargeConfig, label: string) => {
    if (!config.enabled || config.allocationMethod !== 'custom' || participants.length === 0) {
      return;
    }
    const totalWeight = participants.reduce(
      (acc, p) => acc + Math.max(0, config.customWeights[p.id] ?? 0),
      0
    );
    if (totalWeight <= 0) {
      validationIssues.push({
        code: 'INVALID_CUSTOM_WEIGHTS',
        severity: 'error',
        message: `النسب المخصصة لـ "${label}" يجب أن تحتوي على قيمة واحدة على الأقل أكبر من صفر.`,
      });
    }
  };

  validateCustomChargeWeights(feeSettings.discount, 'الخصم');
  validateCustomChargeWeights(feeSettings.tax, 'الضريبة');
  validateCustomChargeWeights(feeSettings.serviceCharge, 'رسوم الخدمة');
  validateCustomChargeWeights(feeSettings.deliveryFee, 'رسوم التوصيل');
  validateCustomChargeWeights(feeSettings.otherFees, 'الرسوم الإضافية');

  // Pre-discount net food base per participant (after item-level discounts)
  const netItemFoodByParticipant: Record<string, MinorUnits> = {};
  for (const p of participants) {
    netItemFoodByParticipant[p.id] =
      (grossFoodByParticipant[p.id] ?? 0) - (itemDiscountByParticipant[p.id] ?? 0);
  }
  const totalNetItemFoodMinor = Math.max(0, totalFoodMinor - totalItemDiscountMinor);

  // Step 2: Receipt-level Discount
  const rawReceiptDiscountMinor = resolveChargeAmountMinor(
    feeSettings.discount,
    totalNetItemFoodMinor,
    scale
  );
  // Cap receipt-level discount at remaining net food subtotal
  const totalReceiptDiscountMinor = Math.min(
    totalNetItemFoodMinor,
    Math.max(0, rawReceiptDiscountMinor)
  );
  const receiptDiscountWeights = buildAllocationWeights(
    feeSettings.discount.allocationMethod,
    participants,
    netItemFoodByParticipant,
    feeSettings.discount.customWeights
  );
  const receiptDiscountByParticipant = allocateByWeightsMinor(
    totalReceiptDiscountMinor,
    receiptDiscountWeights
  );

  // Post-discount net food base per participant
  const netFoodAfterDiscountByParticipant: Record<string, MinorUnits> = {};
  for (const p of participants) {
    netFoodAfterDiscountByParticipant[p.id] = Math.max(
      0,
      (netItemFoodByParticipant[p.id] ?? 0) - (receiptDiscountByParticipant[p.id] ?? 0)
    );
  }
  const totalNetFoodAfterDiscountMinor = Math.max(
    0,
    totalNetItemFoodMinor - totalReceiptDiscountMinor
  );

  // Step 3: Service Charge
  const serviceChargeBaseMinor =
    feeSettings.serviceCharge.taxBase === 'pre_discount'
      ? totalNetItemFoodMinor
      : totalNetFoodAfterDiscountMinor;
  const serviceChargeParticipantBase =
    feeSettings.serviceCharge.taxBase === 'pre_discount'
      ? netItemFoodByParticipant
      : netFoodAfterDiscountByParticipant;

  const totalServiceChargeMinor = Math.max(
    0,
    resolveChargeAmountMinor(feeSettings.serviceCharge, serviceChargeBaseMinor, scale)
  );
  const serviceChargeWeights = buildAllocationWeights(
    feeSettings.serviceCharge.allocationMethod,
    participants,
    serviceChargeParticipantBase,
    feeSettings.serviceCharge.customWeights
  );
  const serviceChargeByParticipant = allocateByWeightsMinor(
    totalServiceChargeMinor,
    serviceChargeWeights
  );

  // Step 4: Receipt-level Tax (respecting tax-inclusive mode & avoiding double application of item taxes)
  const taxBaseMinor =
    feeSettings.tax.taxBase === 'pre_discount'
      ? totalNetItemFoodMinor
      : totalNetFoodAfterDiscountMinor;
  const taxParticipantBase =
    feeSettings.tax.taxBase === 'pre_discount'
      ? netItemFoodByParticipant
      : netFoodAfterDiscountByParticipant;

  let computedReceiptTaxMinor: MinorUnits = 0;
  if (feeSettings.tax.enabled) {
    if (
      feeSettings.tax.preferPrintedAmount &&
      typeof feeSettings.tax.printedAmount === 'number' &&
      feeSettings.tax.printedAmount > 0
    ) {
      computedReceiptTaxMinor = toMinorUnits(feeSettings.tax.printedAmount, scale);
    } else if (feeSettings.tax.valueType === 'fixed') {
      computedReceiptTaxMinor = toMinorUnits(feeSettings.tax.value, scale);
    } else if (feeSettings.tax.isTaxInclusive) {
      computedReceiptTaxMinor = computeEmbeddedTaxMinor(taxBaseMinor, feeSettings.tax.value);
    } else {
      computedReceiptTaxMinor = computePercentageMinor(taxBaseMinor, feeSettings.tax.value);
    }
  }

  // Prevent applying the same tax twice if item-level taxes are already present on items
  const existingItemTaxMinor = feeSettings.tax.isTaxInclusive
    ? totalItemInclusiveTaxMinor
    : totalItemAdditiveTaxMinor;
  const netReceiptTaxMinor =
    existingItemTaxMinor > 0 && feeSettings.tax.preferPrintedAmount
      ? Math.max(0, computedReceiptTaxMinor - existingItemTaxMinor)
      : Math.max(0, computedReceiptTaxMinor);

  const taxWeights = buildAllocationWeights(
    feeSettings.tax.allocationMethod,
    participants,
    taxParticipantBase,
    feeSettings.tax.customWeights
  );
  const receiptTaxByParticipant = allocateByWeightsMinor(netReceiptTaxMinor, taxWeights);

  // Step 5: Delivery Fee, Other Fees, and Explicit Rounding Adjustment
  const totalDeliveryFeeMinor = Math.max(
    0,
    resolveChargeAmountMinor(feeSettings.deliveryFee, totalNetFoodAfterDiscountMinor, scale)
  );
  const deliveryWeights = buildAllocationWeights(
    feeSettings.deliveryFee.allocationMethod,
    participants,
    netFoodAfterDiscountByParticipant,
    feeSettings.deliveryFee.customWeights
  );
  const deliveryByParticipant = allocateByWeightsMinor(totalDeliveryFeeMinor, deliveryWeights);

  const baseOtherFeesMinor = Math.max(
    0,
    resolveChargeAmountMinor(feeSettings.otherFees, totalNetFoodAfterDiscountMinor, scale)
  );
  const otherFeesWeights = buildAllocationWeights(
    feeSettings.otherFees.allocationMethod,
    participants,
    netFoodAfterDiscountByParticipant,
    feeSettings.otherFees.customWeights
  );
  const otherFeesByParticipant = allocateByWeightsMinor(baseOtherFeesMinor, otherFeesWeights);

  const explicitRoundingMinor = toMinorUnits(feeSettings.roundingAdjustment, scale);
  const adjustmentWeights = buildAllocationWeights(
    feeSettings.adjustmentAllocationMethod,
    participants,
    netFoodAfterDiscountByParticipant
  );
  const explicitRoundingByParticipant = allocateByWeightsMinor(
    explicitRoundingMinor,
    adjustmentWeights
  );

  // Compute totals before agreedFinalTotal reconciliation
  const totalDiscountMinor = totalItemDiscountMinor + totalReceiptDiscountMinor;
  const totalTaxMinor = feeSettings.tax.isTaxInclusive
    ? 0
    : totalItemAdditiveTaxMinor + netReceiptTaxMinor;
  const totalInclusiveTaxInfoMinor = feeSettings.tax.isTaxInclusive
    ? totalItemInclusiveTaxMinor + netReceiptTaxMinor
    : totalItemInclusiveTaxMinor;

  const computedUnreconciledTotalMinor =
    totalFoodMinor -
    totalDiscountMinor +
    totalTaxMinor +
    totalServiceChargeMinor +
    totalDeliveryFeeMinor +
    baseOtherFeesMinor +
    explicitRoundingMinor;

  // Step 6: Check against agreedFinalTotal and reconcile if requested
  let reconciliationDeltaMinor: MinorUnits = 0;
  if (feeSettings.agreedFinalTotal > 0) {
    const agreedFinalMinor = toMinorUnits(feeSettings.agreedFinalTotal, scale);
    const diffMinor = agreedFinalMinor - computedUnreconciledTotalMinor;

    if (diffMinor !== 0) {
      const diffMajor = fromMinorUnits(diffMinor, scale);
      if (feeSettings.reconcileToFinalTotal) {
        reconciliationDeltaMinor = diffMinor;
        validationIssues.push({
          code: 'RECEIPT_TOTAL_MISMATCH',
          severity: 'warning',
          message: `تمت تسوية فارق الفاتورة (${diffMajor > 0 ? '+' : ''}${diffMajor.toFixed(2)} ${currency}) تلقائياً ليطابق إجمالي الفاتورة المتفق عليه (${feeSettings.agreedFinalTotal.toFixed(2)} ${currency}).`,
        });
      } else {
        validationIssues.push({
          code: 'RECEIPT_TOTAL_MISMATCH',
          severity: 'warning',
          message: `مجموع البنود المحسوب (${fromMinorUnits(computedUnreconciledTotalMinor, scale).toFixed(2)} ${currency}) يختلف عن إجمالي الفاتورة المسجل (${feeSettings.agreedFinalTotal.toFixed(2)} ${currency}) بفارق ${diffMajor > 0 ? '+' : ''}${diffMajor.toFixed(2)} ${currency}. يمكنك تفعيل التسوية التلقائية لتوزيع الفارق.`,
        });
      }
    }
  }

  const reconciliationByParticipant = allocateByWeightsMinor(
    reconciliationDeltaMinor,
    adjustmentWeights
  );

  const totalOtherFeesMinor =
    baseOtherFeesMinor + explicitRoundingMinor + reconciliationDeltaMinor;

  // Assemble participant results
  const participantResults: ParticipantCalculationResult[] = participants.map((p) => {
    const foodSubtotalMinor = grossFoodByParticipant[p.id] ?? 0;
    const discountShareMinor =
      (itemDiscountByParticipant[p.id] ?? 0) + (receiptDiscountByParticipant[p.id] ?? 0);
    const taxShareMinor = feeSettings.tax.isTaxInclusive
      ? 0
      : (itemAdditiveTaxByParticipant[p.id] ?? 0) + (receiptTaxByParticipant[p.id] ?? 0);
    const inclusiveTaxInfoMinor = feeSettings.tax.isTaxInclusive
      ? (itemInclusiveTaxByParticipant[p.id] ?? 0) + (receiptTaxByParticipant[p.id] ?? 0)
      : (itemInclusiveTaxByParticipant[p.id] ?? 0);
    const deliveryShareMinor = deliveryByParticipant[p.id] ?? 0;
    const serviceChargeShareMinor = serviceChargeByParticipant[p.id] ?? 0;
    const otherFeesShareMinor =
      (otherFeesByParticipant[p.id] ?? 0) +
      (explicitRoundingByParticipant[p.id] ?? 0) +
      (reconciliationByParticipant[p.id] ?? 0);

    const finalTotalMinor =
      foodSubtotalMinor -
      discountShareMinor +
      taxShareMinor +
      serviceChargeShareMinor +
      deliveryShareMinor +
      otherFeesShareMinor;

    if (finalTotalMinor < 0) {
      validationIssues.push({
        code: 'NEGATIVE_PARTICIPANT_TOTAL',
        severity: 'error',
        participantId: p.id,
        message: `إجمالي المبلغ المطلوب من "${p.name}" سالب (${fromMinorUnits(finalTotalMinor, scale).toFixed(2)} ${currency}). يرجى مراجعة الخصومات أو التسويات.`,
      });
    }

    return {
      participantId: p.id,
      participantName: p.name,
      items: participantItemsMap[p.id] ?? [],
      foodSubtotalMinor,
      discountShareMinor,
      taxShareMinor,
      inclusiveTaxInfoMinor,
      deliveryShareMinor,
      serviceChargeShareMinor,
      otherFeesShareMinor,
      finalTotalMinor,
      foodSubtotal: fromMinorUnits(foodSubtotalMinor, scale),
      discountShare: fromMinorUnits(discountShareMinor, scale),
      taxShare: fromMinorUnits(taxShareMinor, scale),
      deliveryShare: fromMinorUnits(deliveryShareMinor, scale),
      serviceChargeShare: fromMinorUnits(serviceChargeShareMinor, scale),
      otherFeesShare: fromMinorUnits(otherFeesShareMinor, scale),
      finalTotal: fromMinorUnits(finalTotalMinor, scale),
    };
  });

  const finalBillTotalMinor =
    participants.length > 0
      ? participantResults.reduce((acc, p) => acc + p.finalTotalMinor, 0)
      : computedUnreconciledTotalMinor + reconciliationDeltaMinor;

  const isValid = !validationIssues.some((issue) => issue.severity === 'error');

  return {
    currency,
    minorUnitScale: scale,
    participants: participantResults,
    totalFoodMinor,
    totalDiscountMinor,
    totalTaxMinor,
    totalInclusiveTaxInfoMinor,
    totalServiceChargeMinor,
    totalDeliveryFeeMinor,
    totalOtherFeesMinor,
    computedUnreconciledTotalMinor,
    reconciliationDeltaMinor,
    finalBillTotalMinor,
    finalBillTotal: fromMinorUnits(finalBillTotalMinor, scale),
    validationIssues,
    isValid,
  };
}
