'use client';

import React from 'react';
import type {
  AllocationMethod,
  FeeSettingsConfig,
  Participant,
} from '@ehsebhaly/types';

export interface FeeSettingsProps {
  currency: string;
  participants: Participant[];
  feeSettings: FeeSettingsConfig;
  onChangeFeeSettings: (updated: FeeSettingsConfig) => void;
  onBack: () => void;
  onNext: () => void;
}

export function FeeSettings({
  currency,
  feeSettings,
  onChangeFeeSettings,
  onBack,
  onNext,
}: FeeSettingsProps) {
  const setTaxAmount = (val: number) => {
    const safe = Math.max(0, val);
    onChangeFeeSettings({
      ...feeSettings,
      tax: {
        ...feeSettings.tax,
        enabled: safe > 0,
        valueType: 'fixed',
        value: safe,
        printedAmount: safe,
        preferPrintedAmount: true,
      },
    });
  };

  const setServiceAmount = (val: number) => {
    const safe = Math.max(0, val);
    onChangeFeeSettings({
      ...feeSettings,
      serviceCharge: {
        ...feeSettings.serviceCharge,
        enabled: safe > 0,
        valueType: 'fixed',
        value: safe,
        printedAmount: safe,
        preferPrintedAmount: true,
      },
    });
  };

  const setDeliveryAmount = (val: number) => {
    const safe = Math.max(0, val);
    onChangeFeeSettings({
      ...feeSettings,
      deliveryFee: {
        ...feeSettings.deliveryFee,
        enabled: safe > 0,
        valueType: 'fixed',
        value: safe,
        printedAmount: safe,
        preferPrintedAmount: true,
      },
    });
  };

  const setDiscountAmount = (val: number) => {
    const safe = Math.max(0, val);
    onChangeFeeSettings({
      ...feeSettings,
      discount: {
        ...feeSettings.discount,
        enabled: safe > 0,
        valueType: 'fixed',
        value: safe,
        printedAmount: safe,
        preferPrintedAmount: true,
      },
    });
  };

  const renderSplitMethodPills = (
    current: AllocationMethod,
    onSelect: (m: AllocationMethod) => void
  ) => (
    <div className="split-method-pills" role="group" aria-label="طريقة التقسيم">
      <button
        type="button"
        className={`pill-toggle ${current === 'equal' ? 'pill-toggle-active' : ''}`}
        onClick={() => onSelect('equal')}
      >
        بالتساوي على الجميع
      </button>
      <button
        type="button"
        className={`pill-toggle ${current === 'proportional' ? 'pill-toggle-active' : ''}`}
        onClick={() => onSelect('proportional')}
      >
        بنسبة أكل كل شخص
      </button>
    </div>
  );

  return (
    <section className="card" aria-labelledby="fees-step-title">
      <div className="card-header">
        <div>
          <h2 id="fees-step-title" className="section-title">
            5. رسوم الفاتورة وطريقة تقسيمها
          </h2>
          <p className="section-subtitle">
            الأرقام هنا تُؤخذ من الفاتورة فقط (لا يتم إضافة أي نسبة من التطبيق تلقائياً). اختر كيف تريد توزيع الموجود منها.
          </p>
        </div>
      </div>

      <div className="simple-fees-list">
        {/* 1. التوصيل */}
        <div className="simple-fee-row">
          <div className="simple-fee-info">
            <label htmlFor="fee-delivery-input" className="simple-fee-title">
              🛵 التوصيل المكتوب في الفاتورة ({currency})
            </label>
            <input
              id="fee-delivery-input"
              type="number"
              min="0"
              step="0.01"
              className="form-input input-compact"
              value={feeSettings.deliveryFee.enabled ? feeSettings.deliveryFee.value : 0}
              onChange={(e) => setDeliveryAmount(parseFloat(e.target.value) || 0)}
            />
          </div>
          {feeSettings.deliveryFee.enabled &&
            feeSettings.deliveryFee.value > 0 &&
            renderSplitMethodPills(
              feeSettings.deliveryFee.allocationMethod,
              (m) =>
                onChangeFeeSettings({
                  ...feeSettings,
                  deliveryFee: { ...feeSettings.deliveryFee, allocationMethod: m },
                })
            )}
        </div>

        {/* 2. الضريبة (14% في الفاتورة) */}
        <div className="simple-fee-row">
          <div className="simple-fee-info">
            <label htmlFor="fee-tax-input" className="simple-fee-title">
              🏛️ الضريبة المكتوبة في الفاتورة (مثل 14%) ({currency})
            </label>
            <input
              id="fee-tax-input"
              type="number"
              min="0"
              step="0.01"
              className="form-input input-compact"
              value={feeSettings.tax.enabled ? feeSettings.tax.value : 0}
              onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
            />
          </div>
          {feeSettings.tax.enabled &&
            feeSettings.tax.value > 0 &&
            renderSplitMethodPills(feeSettings.tax.allocationMethod, (m) =>
              onChangeFeeSettings({
                ...feeSettings,
                tax: { ...feeSettings.tax, allocationMethod: m },
              })
            )}
        </div>

        {/* 3. الخدمة (12% في الفاتورة) */}
        <div className="simple-fee-row">
          <div className="simple-fee-info">
            <label htmlFor="fee-service-input" className="simple-fee-title">
              🍽️ الخدمة المكتوبة في الفاتورة (مثل 12%) ({currency})
            </label>
            <input
              id="fee-service-input"
              type="number"
              min="0"
              step="0.01"
              className="form-input input-compact"
              value={
                feeSettings.serviceCharge.enabled ? feeSettings.serviceCharge.value : 0
              }
              onChange={(e) => setServiceAmount(parseFloat(e.target.value) || 0)}
            />
          </div>
          {feeSettings.serviceCharge.enabled &&
            feeSettings.serviceCharge.value > 0 &&
            renderSplitMethodPills(
              feeSettings.serviceCharge.allocationMethod,
              (m) =>
                onChangeFeeSettings({
                  ...feeSettings,
                  serviceCharge: {
                    ...feeSettings.serviceCharge,
                    allocationMethod: m,
                  },
                })
            )}
        </div>

        {/* 4. الخصم */}
        <div className="simple-fee-row">
          <div className="simple-fee-info">
            <label htmlFor="fee-discount-input" className="simple-fee-title">
              🏷️ الخصم المكتوب في الفاتورة ({currency})
            </label>
            <input
              id="fee-discount-input"
              type="number"
              min="0"
              step="0.01"
              className="form-input input-compact"
              value={feeSettings.discount.enabled ? feeSettings.discount.value : 0}
              onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
            />
          </div>
          {feeSettings.discount.enabled &&
            feeSettings.discount.value > 0 &&
            renderSplitMethodPills(feeSettings.discount.allocationMethod, (m) =>
              onChangeFeeSettings({
                ...feeSettings,
                discount: { ...feeSettings.discount, allocationMethod: m },
              })
            )}
        </div>
      </div>

      <div className="step-footer">
        <button type="button" className="btn btn-outline" onClick={onBack}>
          → رجوع لتوزيع الأصناف
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          احسبهالي واعرض النتيجة ←
        </button>
      </div>
    </section>
  );
}
