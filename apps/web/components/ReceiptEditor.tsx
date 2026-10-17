'use client';

import React from 'react';
import type { ReceiptData, ReceiptItem } from '@ehsebhaly/types';

export interface ReceiptEditorProps {
  receipt: ReceiptData;
  reconciliationWarnings: string[];
  onChangeReceipt: (updated: ReceiptData) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ReceiptEditor({
  receipt,
  reconciliationWarnings,
  onChangeReceipt,
  onBack,
  onNext,
}: ReceiptEditorProps) {
  const round2 = (n: number): number => Math.round(n * 100) / 100;

  const recalculateTotals = (
    items: ReceiptItem[],
    overrides?: Partial<ReceiptData>
  ): ReceiptData => {
    const merged = { ...receipt, ...overrides, items };
    const subtotal = round2(items.reduce((sum, it) => sum + it.lineTotal, 0));
    const additiveTax = merged.isTaxInclusive ? 0 : merged.taxAmount;
    const computedFinal = round2(
      subtotal -
        merged.discountAmount +
        additiveTax +
        merged.serviceChargeAmount +
        merged.deliveryFee +
        merged.otherFees +
        merged.roundingAdjustment
    );

    return {
      ...merged,
      subtotal,
      finalTotal:
        overrides && 'finalTotal' in overrides && typeof overrides.finalTotal === 'number'
          ? overrides.finalTotal
          : computedFinal,
    };
  };

  const handleItemChange = (
    index: number,
    field: 'name' | 'quantity' | 'unitPrice' | 'lineTotal',
    value: string | number
  ) => {
    const updatedItems = receipt.items.map((item, idx) => {
      if (idx !== index) return item;
      const updated: ReceiptItem = { ...item, [field]: value, uncertain: false };
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? Number(value) : item.quantity;
        const price = field === 'unitPrice' ? Number(value) : item.unitPrice;
        updated.lineTotal = round2(Math.max(0, qty) * Math.max(0, price));
      }
      return updated;
    });
    onChangeReceipt(recalculateTotals(updatedItems));
  };

  const handleAddItem = () => {
    const nextIdx = receipt.items.length + 1;
    const newItem: ReceiptItem = {
      id: `item-${Date.now()}-${nextIdx}`,
      name: `صنف ${nextIdx}`,
      quantity: 1,
      unitPrice: 100,
      lineTotal: 100,
      itemDiscount: 0,
      itemTax: 0,
      isTaxInclusive: false,
      uncertain: false,
    };
    onChangeReceipt(recalculateTotals([...receipt.items, newItem]));
  };

  const handleRemoveItem = (id: string) => {
    const updatedItems = receipt.items.filter((it) => it.id !== id);
    onChangeReceipt(recalculateTotals(updatedItems));
  };

  const computedSubtotal = round2(
    receipt.items.reduce((acc, item) => acc + item.lineTotal, 0)
  );

  const canProceed =
    receipt.items.length > 0 &&
    receipt.items.every(
      (it) => it.name.trim().length > 0 && it.quantity > 0 && it.unitPrice >= 0
    );

  return (
    <section className="card" aria-labelledby="review-step-title">
      <div className="card-header">
        <div>
          <h2 id="review-step-title" className="section-title">
            2. أصناف وأرقام الفاتورة
          </h2>
          <p className="section-subtitle">
            تأكد من الأصناف والأرقام المكتوبة في الفاتورة (الضريبة أو الخدمة أو التوصيل تُكتب فقط لو موجودة في الفاتورة).
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleAddItem}>
          + إضافة صنف
        </button>
      </div>

      {(reconciliationWarnings.length > 0 || receipt.uncertainFields.length > 0) && (
        <div className="alert alert-warning" role="alert">
          <strong>ملاحظات للمراجعة:</strong>
          <ul className="alert-list">
            {reconciliationWarnings.map((w, i) => (
              <li key={`warn-${i}`}>{w}</li>
            ))}
            {receipt.uncertainFields.map((u, i) => (
              <li key={`unc-${i}`}>{u.reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="form-grid-2">
        <div className="form-group">
          <label htmlFor="restaurant-name" className="form-label">
            اسم المطعم
          </label>
          <input
            id="restaurant-name"
            type="text"
            className="form-input"
            value={receipt.restaurantName}
            onChange={(e) =>
              onChangeReceipt({ ...receipt, restaurantName: e.target.value })
            }
            placeholder="اسم المطعم"
          />
        </div>

        <div className="form-group">
          <label htmlFor="receipt-currency" className="form-label">
            العملة
          </label>
          <select
            id="receipt-currency"
            className="form-input"
            value={receipt.currency}
            onChange={(e) =>
              onChangeReceipt({ ...receipt, currency: e.target.value })
            }
          >
            <option value="EGP">جنيه مصري (EGP)</option>
            <option value="SAR">ريال سعودي (SAR)</option>
            <option value="AED">درهم إماراتي (AED)</option>
            <option value="KWD">دينار كويتي (KWD)</option>
            <option value="USD">دولار أمريكي (USD)</option>
          </select>
        </div>
      </div>

      {receipt.items.length === 0 ? (
        <div className="empty-state">
          <p>لا توجد أصناف حالياً.</p>
          <button type="button" className="btn btn-primary" onClick={handleAddItem}>
            + إضافة أول صنف
          </button>
        </div>
      ) : (
        <div className="items-editor-list">
          {receipt.items.map((item, idx) => (
            <div
              key={item.id}
              className={`item-editor-card ${item.uncertain ? 'item-uncertain' : ''}`}
            >
              <div className="item-editor-header">
                <span className="item-badge">صنف #{idx + 1}</span>
                {receipt.items.length > 1 && (
                  <button
                    type="button"
                    className="btn-icon-danger"
                    onClick={() => handleRemoveItem(item.id)}
                    aria-label={`حذف ${item.name}`}
                  >
                    حذف ✕
                  </button>
                )}
              </div>

              <div className="simple-item-grid">
                <div className="form-group item-name-col">
                  <label className="form-label" htmlFor={`item-name-${item.id}`}>
                    اسم الصنف
                  </label>
                  <input
                    id={`item-name-${item.id}`}
                    type="text"
                    className="form-input"
                    value={item.name}
                    onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                    placeholder="مثال: سندوتش شاورما"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor={`item-qty-${item.id}`}>
                    العدد
                  </label>
                  <input
                    id={`item-qty-${item.id}`}
                    type="number"
                    min="0.25"
                    step="any"
                    className="form-input"
                    value={item.quantity}
                    onChange={(e) =>
                      handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor={`item-price-${item.id}`}>
                    سعر الواحدة
                  </label>
                  <input
                    id={`item-price-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-input"
                    value={item.unitPrice}
                    onChange={(e) =>
                      handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor={`item-total-${item.id}`}>
                    الإجمالي ({receipt.currency})
                  </label>
                  <input
                    id={`item-total-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-input"
                    value={item.lineTotal}
                    onChange={(e) =>
                      handleItemChange(idx, 'lineTotal', parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="receipt-quick-totals">
        <h3 className="subsection-title">
          إضافات الفاتورة المطبوعة (اتركها 0 إذا لم تكن مكتوبة في الفاتورة)
        </h3>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="rec-tax">
              الضريبة المكتوبة في الفاتورة (مثل 14%) ({receipt.currency})
            </label>
            <input
              id="rec-tax"
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              value={receipt.taxAmount}
              onChange={(e) =>
                onChangeReceipt(
                  recalculateTotals(receipt.items, {
                    taxAmount: parseFloat(e.target.value) || 0,
                  })
                )
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rec-service">
              الخدمة المكتوبة في الفاتورة (مثل 12%) ({receipt.currency})
            </label>
            <input
              id="rec-service"
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              value={receipt.serviceChargeAmount}
              onChange={(e) =>
                onChangeReceipt(
                  recalculateTotals(receipt.items, {
                    serviceChargeAmount: parseFloat(e.target.value) || 0,
                  })
                )
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rec-delivery">
              التوصيل المكتوب في الفاتورة ({receipt.currency})
            </label>
            <input
              id="rec-delivery"
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              value={receipt.deliveryFee}
              onChange={(e) =>
                onChangeReceipt(
                  recalculateTotals(receipt.items, {
                    deliveryFee: parseFloat(e.target.value) || 0,
                  })
                )
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rec-discount">
              الخصم المكتوب في الفاتورة ({receipt.currency})
            </label>
            <input
              id="rec-discount"
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              value={receipt.discountAmount}
              onChange={(e) =>
                onChangeReceipt(
                  recalculateTotals(receipt.items, {
                    discountAmount: parseFloat(e.target.value) || 0,
                  })
                )
              }
            />
          </div>
        </div>

        <div className="receipt-summary-strip">
          <div>
            <span>مجموع الأصناف: </span>
            <strong>
              {computedSubtotal.toFixed(2)} {receipt.currency}
            </strong>
          </div>
          <div>
            <span>إجمالي الفاتورة النهائي: </span>
            <strong className="total-highlight-text">
              {receipt.finalTotal.toFixed(2)} {receipt.currency}
            </strong>
          </div>
        </div>
      </div>

      <div className="step-footer">
        <button type="button" className="btn btn-outline" onClick={onBack}>
          → رجوع
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={!canProceed}
        >
          التالي: أسماء المشاركين ←
        </button>
      </div>
    </section>
  );
}
