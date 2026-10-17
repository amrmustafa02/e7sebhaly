'use client';

import React, { useState } from 'react';
import type {
  BillCalculationSummary,
  ParticipantCalculationResult,
} from '@ehsebhaly/types';
import { fromMinorUnits } from '@ehsebhaly/calculations';

export interface ResultsSummaryProps {
  restaurantName: string;
  summary: BillCalculationSummary;
  onBack: () => void;
  onStartNewBill: () => void;
}

export function ResultsSummary({
  restaurantName,
  summary,
  onBack,
  onStartNewBill,
}: ResultsSummaryProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fmt = (val: number): string => val.toFixed(2);

  const buildParticipantText = (p: ParticipantCalculationResult): string => {
    const lines: string[] = [
      `👤 *${p.participantName}* — (${restaurantName})`,
      ...p.items.map(
        (it) =>
          `  • ${it.itemName} (الكمية: ${it.effectiveQuantity}) = ${fmt(
            fromMinorUnits(it.grossAmountMinor, summary.minorUnitScale)
          )} ${summary.currency}`
      ),
      `  الطلبات (Food): ${fmt(p.foodSubtotal)} ${summary.currency}`,
    ];

    if (p.discountShare > 0) {
      lines.push(`  الخصم: -${fmt(p.discountShare)} ${summary.currency}`);
    }
    if (p.taxShare > 0) {
      lines.push(`  الضريبة: +${fmt(p.taxShare)} ${summary.currency}`);
    } else if (p.inclusiveTaxInfoMinor > 0) {
      lines.push(
        `  (ضريبة مشمولة بالسعر: ${fmt(
          fromMinorUnits(p.inclusiveTaxInfoMinor, summary.minorUnitScale)
        )} ${summary.currency})`
      );
    }
    if (p.serviceChargeShare > 0) {
      lines.push(`  رسوم الخدمة: +${fmt(p.serviceChargeShare)} ${summary.currency}`);
    }
    if (p.deliveryShare > 0) {
      lines.push(`  التوصيل: +${fmt(p.deliveryShare)} ${summary.currency}`);
    }
    if (p.otherFeesShare !== 0) {
      lines.push(
        `  رسوم أخرى/تسوية: ${p.otherFeesShare > 0 ? '+' : ''}${fmt(
          p.otherFeesShare
        )} ${summary.currency}`
      );
    }
    lines.push(`  💰 *المطلوب دفعه: ${fmt(p.finalTotal)} ${summary.currency}*`);
    return lines.join('\n');
  };

  const buildFullSummaryText = (): string => {
    const header = `🧾 *تقسيم فاتورة ${restaurantName} — احسبهالي*\n━━━━━━━━━━━━━━━━━━━━`;
    const body = summary.participants.map(buildParticipantText).join('\n\n');
    const footer = [
      '━━━━━━━━━━━━━━━━━━━━',
      `💵 إجمالي الطلبات: ${fmt(
        fromMinorUnits(summary.totalFoodMinor, summary.minorUnitScale)
      )} ${summary.currency}`,
      summary.totalDiscountMinor > 0
        ? `🏷️ إجمالي الخصومات: -${fmt(
            fromMinorUnits(summary.totalDiscountMinor, summary.minorUnitScale)
          )} ${summary.currency}`
        : null,
      summary.totalTaxMinor > 0
        ? `🏛️ إجمالي الضريبة: +${fmt(
            fromMinorUnits(summary.totalTaxMinor, summary.minorUnitScale)
          )} ${summary.currency}`
        : null,
      summary.totalServiceChargeMinor > 0
        ? `🍽️ إجمالي الخدمة: +${fmt(
            fromMinorUnits(summary.totalServiceChargeMinor, summary.minorUnitScale)
          )} ${summary.currency}`
        : null,
      summary.totalDeliveryFeeMinor > 0
        ? `🛵 إجمالي التوصيل: +${fmt(
            fromMinorUnits(summary.totalDeliveryFeeMinor, summary.minorUnitScale)
          )} ${summary.currency}`
        : null,
      summary.totalOtherFeesMinor !== 0
        ? `⚖️ رسوم أخرى/تسوية: ${summary.totalOtherFeesMinor > 0 ? '+' : ''}${fmt(
            fromMinorUnits(summary.totalOtherFeesMinor, summary.minorUnitScale)
          )} ${summary.currency}`
        : null,
      `✅ *الإجمالي النهائي الكلي: ${fmt(summary.finalBillTotal)} ${summary.currency}*`,
    ]
      .filter(Boolean)
      .join('\n');

    return `${header}\n\n${body}\n\n${footer}`;
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2200);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2200);
    }
  };

  const handleShareWhatsApp = (text: string) => {
    const encoded = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/?text=${encoded}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handlePrint = () => {
    window.print();
  };

  const sumParticipantsMinor = summary.participants.reduce(
    (acc, p) => acc + p.finalTotalMinor,
    0
  );
  const isReconciledExact = sumParticipantsMinor === summary.finalBillTotalMinor;

  return (
    <section className="card results-section" aria-labelledby="results-step-title">
      <div className="card-header no-print">
        <div>
          <h2 id="results-step-title" className="section-title">
            6. النتيجة النهائية وتفاصيل حساب كل مشارك
          </h2>
          <p className="section-subtitle">
            مطعم: <strong>{restaurantName}</strong> — تم الحساب بدقة القروش بدون أي تقريب عشوائي.
          </p>
        </div>

        <span
          className={`status-pill ${
            isReconciledExact && summary.isValid
              ? 'status-pill-ok'
              : 'status-pill-warn'
          }`}
        >
          {isReconciledExact
            ? 'مطابقة مالية تامة 100% ✓'
            : 'يرجى مراجعة التنبيهات'}
        </span>
      </div>

      {/* Print-only title */}
      <div className="print-only-header">
        <h1>احسبهالي — ملخص تقسيم فاتورة {restaurantName}</h1>
        <p>الإجمالي النهائي: {fmt(summary.finalBillTotal)} {summary.currency}</p>
      </div>

      {summary.validationIssues.length > 0 && (
        <div className="alert alert-warning no-print" role="status">
          <strong>ملاحظات الحساب والتسوية:</strong>
          <ul className="alert-list">
            {summary.validationIssues.map((issue, idx) => (
              <li key={idx}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Global Actions Bar */}
      <div className="results-actions-bar no-print">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => handleCopyText(buildFullSummaryText(), 'full')}
        >
          {copiedId === 'full' ? '✓ تم نسخ الملخص بالكامل!' : '📋 نسخ الملخص الكامل'}
        </button>

        <button
          type="button"
          className="btn btn-whatsapp"
          onClick={() => handleShareWhatsApp(buildFullSummaryText())}
        >
          💬 مشاركة عبر واتساب (WhatsApp)
        </button>

        <button type="button" className="btn btn-secondary" onClick={handlePrint}>
          🖨️ طباعة الفاتورة المقسمة
        </button>

        <button
          type="button"
          className="btn btn-danger-outline"
          onClick={onStartNewBill}
        >
          🔄 ابدأ فاتورة جديدة
        </button>
      </div>

      {/* Participant Breakdown Cards */}
      <div className="participant-results-grid">
        {summary.participants.map((p) => (
          <article key={p.participantId} className="participant-result-card">
            <div className="participant-result-header">
              <div>
                <h3 className="participant-result-name">{p.participantName}</h3>
                <span className="participant-items-count">
                  {p.items.length} صنف مخصص
                </span>
              </div>
              <div className="participant-final-badge">
                <span className="final-badge-label">المطلوب دفعه</span>
                <strong className="final-badge-amount">
                  {fmt(p.finalTotal)} {summary.currency}
                </strong>
              </div>
            </div>

            {p.items.length > 0 && (
              <div className="participant-allocated-items">
                <h4 className="mini-heading">الأصناف:</h4>
                <ul className="allocated-items-ul">
                  {p.items.map((it) => (
                    <li key={it.itemId} className="allocated-item-li">
                      <span>
                        {it.itemName}{' '}
                        <small className="qty-tag">× {it.effectiveQuantity}</small>
                      </span>
                      <strong>
                        {fmt(
                          fromMinorUnits(it.grossAmountMinor, summary.minorUnitScale)
                        )}{' '}
                        {summary.currency}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <dl className="breakdown-dl">
              <div className="breakdown-row">
                <dt>مجموع الأكل</dt>
                <dd>
                  {fmt(p.foodSubtotal)} {summary.currency}
                </dd>
              </div>

              {p.discountShare > 0 && (
                <div className="breakdown-row">
                  <dt>الخصم</dt>
                  <dd className="text-discount">
                    −{fmt(p.discountShare)} {summary.currency}
                  </dd>
                </div>
              )}

              {(p.taxShare > 0 || p.inclusiveTaxInfoMinor > 0) && (
                <div className="breakdown-row">
                  <dt>الضريبة</dt>
                  <dd>
                    {p.taxShare > 0
                      ? `+${fmt(p.taxShare)} ${summary.currency}`
                      : `مشمولة (${fmt(
                          fromMinorUnits(
                            p.inclusiveTaxInfoMinor,
                            summary.minorUnitScale
                          )
                        )} ${summary.currency})`}
                  </dd>
                </div>
              )}

              {p.serviceChargeShare > 0 && (
                <div className="breakdown-row">
                  <dt>الخدمة</dt>
                  <dd>
                    +{fmt(p.serviceChargeShare)} {summary.currency}
                  </dd>
                </div>
              )}

              {p.deliveryShare > 0 && (
                <div className="breakdown-row">
                  <dt>التوصيل</dt>
                  <dd>
                    +{fmt(p.deliveryShare)} {summary.currency}
                  </dd>
                </div>
              )}

              {p.otherFeesShare !== 0 && (
                <div className="breakdown-row">
                  <dt>تسوية / أخرى</dt>
                  <dd>
                    {p.otherFeesShare > 0 ? '+' : ''}
                    {fmt(p.otherFeesShare)} {summary.currency}
                  </dd>
                </div>
              )}

              <div className="breakdown-row breakdown-row-total">
                <dt>المطلوب دفعه</dt>
                <dd>
                  {fmt(p.finalTotal)} {summary.currency}
                </dd>
              </div>
            </dl>

            <div className="participant-card-actions no-print">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() =>
                  handleCopyText(buildParticipantText(p), `copy-${p.participantId}`)
                }
              >
                {copiedId === `copy-${p.participantId}`
                  ? '✓ تم نسخ الحساب'
                  : `نسخ حساب ${p.participantName}`}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleShareWhatsApp(buildParticipantText(p))}
              >
                إرسال واتساب لـ {p.participantName}
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Overall Bill Summary Footer Table */}
      <div className="overall-bill-summary-box">
        <h3 className="subsection-title">ملخص مطابقة الفاتورة الكلية</h3>
        <div className="overall-summary-grid">
          <div className="summary-stat">
            <span>إجمالي الأصناف</span>
            <strong>
              {fmt(fromMinorUnits(summary.totalFoodMinor, summary.minorUnitScale))}{' '}
              {summary.currency}
            </strong>
          </div>
          <div className="summary-stat">
            <span>إجمالي الخصومات</span>
            <strong>
              −{fmt(fromMinorUnits(summary.totalDiscountMinor, summary.minorUnitScale))}{' '}
              {summary.currency}
            </strong>
          </div>
          <div className="summary-stat">
            <span>إجمالي الضريبة المضافة</span>
            <strong>
              +{fmt(fromMinorUnits(summary.totalTaxMinor, summary.minorUnitScale))}{' '}
              {summary.currency}
            </strong>
          </div>
          <div className="summary-stat">
            <span>إجمالي الخدمة</span>
            <strong>
              +{fmt(fromMinorUnits(summary.totalServiceChargeMinor, summary.minorUnitScale))}{' '}
              {summary.currency}
            </strong>
          </div>
          <div className="summary-stat">
            <span>إجمالي التوصيل</span>
            <strong>
              +{fmt(fromMinorUnits(summary.totalDeliveryFeeMinor, summary.minorUnitScale))}{' '}
              {summary.currency}
            </strong>
          </div>
          <div className="summary-stat summary-stat-highlight">
            <span>مجموع حصص المشاركين النهائي</span>
            <strong>
              {fmt(summary.finalBillTotal)} {summary.currency}
            </strong>
          </div>
        </div>
      </div>

      <div className="step-footer no-print">
        <button type="button" className="btn btn-outline" onClick={onBack}>
          → تعديل الضرائب والرسوم
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStartNewBill}
        >
          🔄 ابدأ فاتورة جديدة
        </button>
      </div>
    </section>
  );
}
