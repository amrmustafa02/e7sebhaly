'use client';

import React, { useState, useMemo } from 'react';
import type {
  FeeSettingsConfig,
  ItemAllocationEntry,
  Participant,
  ReceiptData,
} from '@ehsebhaly/types';
import {
  calculateBillSplit,
  createDefaultFeeSettings,
} from '@ehsebhaly/calculations';
import { ReceiptUploader } from '@/components/ReceiptUploader';
import { ReceiptEditor } from '@/components/ReceiptEditor';
import { ParticipantsForm } from '@/components/ParticipantsForm';
import { ItemAllocation } from '@/components/ItemAllocation';
import { FeeSettings } from '@/components/FeeSettings';
import { ResultsSummary } from '@/components/ResultsSummary';

type WorkflowStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_LABELS: Array<{ step: WorkflowStep; title: string }> = [
  { step: 1, title: '1. الفاتورة' },
  { step: 2, title: '2. الأصناف' },
  { step: 3, title: '3. المشاركون' },
  { step: 4, title: '4. التقسيم' },
  { step: 5, title: '5. الرسوم' },
  { step: 6, title: '6. النتيجة' },
];

function createEmptyReceipt(): ReceiptData {
  return {
    restaurantName: 'مطعم جديد',
    currency: 'EGP',
    items: [
      {
        id: 'item-1',
        name: 'وجبة رئيسية',
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        itemDiscount: 0,
        itemTax: 0,
        isTaxInclusive: false,
        uncertain: false,
      },
    ],
    subtotal: 100,
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
    finalTotal: 100,
    uncertainFields: [],
  };
}

export default function HomePage() {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(1);
  const [receipt, setReceipt] = useState<ReceiptData>(() => createEmptyReceipt());
  const [reconciliationWarnings, setReconciliationWarnings] = useState<string[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [allocations, setAllocations] = useState<ItemAllocationEntry[]>([]);
  const [feeSettings, setFeeSettings] = useState<FeeSettingsConfig>(() =>
    createDefaultFeeSettings(createEmptyReceipt(), [])
  );

  const handleStartNewBill = () => {
    const freshReceipt = createEmptyReceipt();
    setReceipt(freshReceipt);
    setReconciliationWarnings([]);
    setParticipants([]);
    setAllocations([]);
    setFeeSettings(createDefaultFeeSettings(freshReceipt, []));
    setCurrentStep(1);
  };

  const handleReceiptExtracted = (
    extracted: ReceiptData,
    warnings: string[]
  ) => {
    setReceipt(extracted);
    setReconciliationWarnings(warnings);
    setAllocations([]);
    setFeeSettings(createDefaultFeeSettings(extracted, participants));
    setCurrentStep(2);
  };

  const handleStartManual = () => {
    const manualReceipt = createEmptyReceipt();
    setReceipt(manualReceipt);
    setReconciliationWarnings([]);
    setAllocations([]);
    setFeeSettings(createDefaultFeeSettings(manualReceipt, participants));
    setCurrentStep(2);
  };

  const handleLoadDemoExample = () => {
    const demoParticipants: Participant[] = [
      { id: 'p-me', name: 'أنا' },
      { id: 'p-mohamed', name: 'محمد' },
      { id: 'p-ali', name: 'علي' },
      { id: 'p-hussein', name: 'حسين' },
    ];
    const demoReceipt: ReceiptData = {
      restaurantName: 'مطعم السندوتشات',
      currency: 'EGP',
      items: [
        {
          id: 'item-sandwiches',
          name: 'سندوتش',
          quantity: 5,
          unitPrice: 100,
          lineTotal: 500,
          itemDiscount: 0,
          itemTax: 0,
          isTaxInclusive: false,
          uncertain: false,
        },
      ],
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
    const demoAllocations: ItemAllocationEntry[] = [
      {
        itemId: 'item-sandwiches',
        directUnits: {
          'p-me': 2,
          'p-mohamed': 1,
          'p-ali': 1,
          'p-hussein': 0,
        },
        sharedSplits: [
          {
            id: 'split-last-sandwich',
            quantity: 1,
            mode: 'equal',
            participantWeights: {
              'p-mohamed': 1,
              'p-hussein': 1,
            },
          },
        ],
      },
    ];

    setParticipants(demoParticipants);
    setReceipt(demoReceipt);
    setReconciliationWarnings([]);
    setAllocations(demoAllocations);
    setFeeSettings(createDefaultFeeSettings(demoReceipt, demoParticipants));
    setCurrentStep(4);
  };

  const handleUpdateReceipt = (updated: ReceiptData) => {
    setReceipt(updated);
    setFeeSettings((prev) => ({
      ...prev,
      discount: {
        ...prev.discount,
        enabled: updated.discountAmount > 0,
        valueType: 'fixed',
        value: updated.discountAmount,
        printedAmount: updated.discountAmount,
        preferPrintedAmount: true,
      },
      tax: {
        ...prev.tax,
        enabled: updated.taxAmount > 0,
        valueType: 'fixed',
        value: updated.taxAmount,
        printedAmount: updated.taxAmount,
        preferPrintedAmount: true,
        isTaxInclusive: updated.isTaxInclusive,
      },
      serviceCharge: {
        ...prev.serviceCharge,
        enabled: updated.serviceChargeAmount > 0,
        valueType: 'fixed',
        value: updated.serviceChargeAmount,
        printedAmount: updated.serviceChargeAmount,
        preferPrintedAmount: true,
      },
      deliveryFee: {
        ...prev.deliveryFee,
        enabled: updated.deliveryFee > 0,
        valueType: 'fixed',
        value: updated.deliveryFee,
        printedAmount: updated.deliveryFee,
        preferPrintedAmount: true,
      },
      agreedFinalTotal: updated.finalTotal,
    }));
  };

  const calculationSummary = useMemo(
    () =>
      calculateBillSplit({
        currency: receipt.currency,
        items: receipt.items,
        participants,
        allocations,
        feeSettings,
      }),
    [receipt.currency, receipt.items, participants, allocations, feeSettings]
  );

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div className="container header-inner">
          <div className="brand-box">
            <span className="brand-logo" aria-hidden="true">
              🧾
            </span>
            <div>
              <h1 className="brand-title">احسبهالي</h1>
              <p className="brand-subtitle">قسم فاتورة المطعم بسهولة</p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleStartNewBill}
          >
            🔄 فاتورة جديدة
          </button>
        </div>
      </header>

      <nav className="stepper-nav no-print" aria-label="خطوات تقسيم الفاتورة">
        <div className="container stepper-list">
          {STEP_LABELS.map((item) => {
            const isActive = currentStep === item.step;
            const isCompleted = currentStep > item.step;
            return (
              <button
                key={item.step}
                type="button"
                className={`stepper-tab ${
                  isActive
                    ? 'stepper-tab-active'
                    : isCompleted
                      ? 'stepper-tab-done'
                      : ''
                }`}
                onClick={() => setCurrentStep(item.step)}
                aria-current={isActive ? 'step' : undefined}
              >
                {item.title}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="container main-content">
        {currentStep === 1 && (
          <ReceiptUploader
            onReceiptExtracted={handleReceiptExtracted}
            onStartManual={handleStartManual}
            onLoadDemoExample={handleLoadDemoExample}
          />
        )}

        {currentStep === 2 && (
          <ReceiptEditor
            receipt={receipt}
            reconciliationWarnings={reconciliationWarnings}
            onChangeReceipt={handleUpdateReceipt}
            onBack={() => setCurrentStep(1)}
            onNext={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 3 && (
          <ParticipantsForm
            participants={participants}
            onChangeParticipants={setParticipants}
            onBack={() => setCurrentStep(2)}
            onNext={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 4 && (
          <ItemAllocation
            currency={receipt.currency}
            items={receipt.items}
            participants={participants}
            allocations={allocations}
            onChangeAllocations={setAllocations}
            onBack={() => setCurrentStep(3)}
            onNext={() => setCurrentStep(5)}
          />
        )}

        {currentStep === 5 && (
          <FeeSettings
            currency={receipt.currency}
            participants={participants}
            feeSettings={feeSettings}
            onChangeFeeSettings={setFeeSettings}
            onBack={() => setCurrentStep(4)}
            onNext={() => setCurrentStep(6)}
          />
        )}

        {currentStep === 6 && (
          <ResultsSummary
            restaurantName={receipt.restaurantName}
            summary={calculationSummary}
            onBack={() => setCurrentStep(5)}
            onStartNewBill={handleStartNewBill}
          />
        )}
      </main>
    </div>
  );
}
