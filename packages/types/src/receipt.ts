/**
 * Minor currency unit representation (e.g., piasters for EGP, cents for USD, halalas for SAR).
 * Stored as an integer to avoid IEEE-754 floating-point arithmetic errors.
 */
export type MinorUnits = number;

export type AllocationMethod = 'equal' | 'proportional' | 'custom';

export type ChargeValueType = 'fixed' | 'percentage';

export type TaxBaseMode = 'post_discount' | 'pre_discount';

export interface UncertainField {
  field: string;
  reason: string;
  suggestedValue?: string | number | null;
}

export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  /** Unit price in major currency units (e.g. 100.00 EGP) for UI editing; converted to MinorUnits in calculator */
  unitPrice: number;
  /** Total price for the line (quantity * unitPrice before item discount/tax, or printed line total) */
  lineTotal: number;
  /** Optional item-level discount in major currency units */
  itemDiscount: number;
  /** Optional item-level tax in major currency units */
  itemTax: number;
  /** Whether the item price already includes tax */
  isTaxInclusive: boolean;
  /** Whether the AI flagged this item as uncertain or partially unreadable */
  uncertain?: boolean;
  uncertaintyNote?: string;
}

export interface ReceiptData {
  restaurantName: string;
  currency: string;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount: number;
  discountPercentage: number | null;
  taxAmount: number;
  taxPercentage: number | null;
  isTaxInclusive: boolean;
  serviceChargeAmount: number;
  serviceChargePercentage: number | null;
  deliveryFee: number;
  otherFees: number;
  roundingAdjustment: number;
  finalTotal: number;
  uncertainFields: UncertainField[];
}

export interface Participant {
  id: string;
  name: string;
}

export interface SharedItemSplit {
  id: string;
  /** How many units of the item are shared in this group (e.g. 1 sandwich out of 5) */
  quantity: number;
  mode: 'equal' | 'custom';
  /** Map of participantId -> weight/proportion (for 'equal', any value > 0 means included) */
  participantWeights: Record<string, number>;
}

export interface ItemAllocationEntry {
  itemId: string;
  /** Direct unit quantities assigned to individual participants (participantId -> quantity) */
  directUnits: Record<string, number>;
  /** Shared splits where multiple participants share a quantity of this item */
  sharedSplits: SharedItemSplit[];
}

export interface ChargeConfig {
  enabled: boolean;
  valueType: ChargeValueType;
  /** Amount in major currency units when valueType === 'fixed', or percentage (0-100) when 'percentage' */
  value: number;
  /** Printed amount on receipt in major units (used when preferPrintedAmount is enabled) */
  printedAmount?: number | null;
  preferPrintedAmount?: boolean;
  allocationMethod: AllocationMethod;
  /** Custom weights per participantId when allocationMethod === 'custom' */
  customWeights: Record<string, number>;
}

export interface FeeSettingsConfig {
  discount: ChargeConfig;
  tax: ChargeConfig & {
    isTaxInclusive: boolean;
    taxBase: TaxBaseMode;
  };
  serviceCharge: ChargeConfig & {
    taxBase: TaxBaseMode;
  };
  deliveryFee: ChargeConfig;
  otherFees: ChargeConfig;
  /** Explicit manual or receipt rounding adjustment in major currency units (can be positive or negative) */
  roundingAdjustment: number;
  /** Allocation method for rounding adjustment or receipt total reconciliation */
  adjustmentAllocationMethod: AllocationMethod;
  /** Whether to automatically reconcile participant totals to match the agreed final total on the receipt */
  reconcileToFinalTotal: boolean;
  /** Agreed final bill total in major currency units */
  agreedFinalTotal: number;
}

export interface ValidationIssue {
  code:
    | 'NO_PARTICIPANTS'
    | 'NO_ITEMS'
    | 'UNASSIGNED_QUANTITY'
    | 'OVERALLOCATED_QUANTITY'
    | 'NEGATIVE_QUANTITY'
    | 'EMPTY_SHARED_SPLIT'
    | 'INVALID_CUSTOM_WEIGHTS'
    | 'NEGATIVE_PRICE'
    | 'RECEIPT_TOTAL_MISMATCH'
    | 'NEGATIVE_PARTICIPANT_TOTAL';
  severity: 'error' | 'warning';
  message: string;
  itemId?: string;
  participantId?: string;
}

export interface ParticipantItemBreakdown {
  itemId: string;
  itemName: string;
  /** Effective quantity assigned to this participant (e.g. 1.5 units) */
  effectiveQuantity: number;
  /** Share of gross item food cost in minor units */
  grossAmountMinor: MinorUnits;
  /** Share of item-level discount in minor units */
  itemDiscountMinor: MinorUnits;
  /** Share of item-level tax in minor units */
  itemTaxMinor: MinorUnits;
  /** Net item food subtotal in minor units (gross - itemDiscount) */
  netFoodMinor: MinorUnits;
}

export interface ParticipantCalculationResult {
  participantId: string;
  participantName: string;
  items: ParticipantItemBreakdown[];
  /** Gross food share before discounts (in minor units) */
  foodSubtotalMinor: MinorUnits;
  /** Item-level + receipt-level discount share (in minor units) */
  discountShareMinor: MinorUnits;
  /** Item-level + receipt-level additive tax share (in minor units) */
  taxShareMinor: MinorUnits;
  /** Share of tax that was already included in tax-inclusive prices (informational, not added twice) */
  inclusiveTaxInfoMinor: MinorUnits;
  /** Delivery fee share (in minor units) */
  deliveryShareMinor: MinorUnits;
  /** Service charge share (in minor units) */
  serviceChargeShareMinor: MinorUnits;
  /** Other fees + rounding/reconciliation adjustment share (in minor units) */
  otherFeesShareMinor: MinorUnits;
  /** Final amount owed by this participant in minor units */
  finalTotalMinor: MinorUnits;
  /** Convenience major unit values (exact minor / 100) */
  foodSubtotal: number;
  discountShare: number;
  taxShare: number;
  deliveryShare: number;
  serviceChargeShare: number;
  otherFeesShare: number;
  finalTotal: number;
}

export interface BillCalculationSummary {
  currency: string;
  minorUnitScale: number;
  participants: ParticipantCalculationResult[];
  /** Total gross food across all items in minor units */
  totalFoodMinor: MinorUnits;
  /** Total discounts (item-level + receipt-level) in minor units */
  totalDiscountMinor: MinorUnits;
  /** Total additive taxes (item-level + receipt-level) in minor units */
  totalTaxMinor: MinorUnits;
  /** Informational tax included in tax-inclusive items/receipt in minor units */
  totalInclusiveTaxInfoMinor: MinorUnits;
  /** Total service charges in minor units */
  totalServiceChargeMinor: MinorUnits;
  /** Total delivery fee in minor units */
  totalDeliveryFeeMinor: MinorUnits;
  /** Total other fees + adjustments in minor units */
  totalOtherFeesMinor: MinorUnits;
  /** Computed bill total before reconciliation to agreedFinalTotal in minor units */
  computedUnreconciledTotalMinor: MinorUnits;
  /** Reconciliation delta applied to match agreedFinalTotal in minor units */
  reconciliationDeltaMinor: MinorUnits;
  /** Final bill total in minor units (equals sum of all participant finalTotalMinor) */
  finalBillTotalMinor: MinorUnits;
  /** Final bill total in major units */
  finalBillTotal: number;
  /** Validation errors and warnings */
  validationIssues: ValidationIssue[];
  /** True if there are no blocking errors (severity === 'error') */
  isValid: boolean;
}

export interface ParseReceiptApiResponse {
  success: boolean;
  data?: ReceiptData;
  reconciliationWarnings?: string[];
  error?: string;
  code?: string;
}
