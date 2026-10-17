'use client';

import React from 'react';
import type {
  ItemAllocationEntry,
  Participant,
  ReceiptItem,
  SharedItemSplit,
} from '@ehsebhaly/types';

export interface ItemAllocationProps {
  currency: string;
  items: ReceiptItem[];
  participants: Participant[];
  allocations: ItemAllocationEntry[];
  onChangeAllocations: (allocations: ItemAllocationEntry[]) => void;
  onBack: () => void;
  onNext: () => void;
}

const EPS = 1e-6;

export function ItemAllocation({
  currency,
  items,
  participants,
  allocations,
  onChangeAllocations,
  onBack,
  onNext,
}: ItemAllocationProps) {
  const getEntryForItem = (itemId: string): ItemAllocationEntry => {
    const found = allocations.find((a) => a.itemId === itemId);
    if (found) return found;
    return {
      itemId,
      directUnits: {},
      sharedSplits: [],
    };
  };

  const updateItemEntry = (itemId: string, updater: (prev: ItemAllocationEntry) => ItemAllocationEntry) => {
    const existing = allocations.some((a) => a.itemId === itemId);
    if (existing) {
      onChangeAllocations(
        allocations.map((a) => (a.itemId === itemId ? updater(a) : a))
      );
    } else {
      onChangeAllocations([...allocations, updater(getEntryForItem(itemId))]);
    }
  };

  const getAllocatedQuantity = (entry: ItemAllocationEntry): number => {
    const directSum = Object.values(entry.directUnits).reduce(
      (sum, val) => sum + (val > 0 ? val : 0),
      0
    );
    const sharedSum = entry.sharedSplits.reduce(
      (sum, s) => sum + (s.quantity > 0 ? s.quantity : 0),
      0
    );
    return Math.round((directSum + sharedSum) * 1000) / 1000;
  };

  const handleSetDirectUnit = (itemId: string, participantId: string, qty: number) => {
    const safeQty = Math.max(0, Math.round(qty * 1000) / 1000);
    updateItemEntry(itemId, (prev) => ({
      ...prev,
      directUnits: {
        ...prev.directUnits,
        [participantId]: safeQty,
      },
    }));
  };

  const handleSplitEntireItemEqually = (item: ReceiptItem) => {
    const weights: Record<string, number> = {};
    for (const p of participants) {
      weights[p.id] = 1;
    }
    updateItemEntry(item.id, () => ({
      itemId: item.id,
      directUnits: {},
      sharedSplits: [
        {
          id: `split-${Date.now()}`,
          quantity: item.quantity,
          mode: 'equal',
          participantWeights: weights,
        },
      ],
    }));
  };

  const handleClearItemAllocation = (itemId: string) => {
    updateItemEntry(itemId, () => ({
      itemId,
      directUnits: {},
      sharedSplits: [],
    }));
  };

  const handleAddSharedSplit = (item: ReceiptItem) => {
    const entry = getEntryForItem(item.id);
    const allocated = getAllocatedQuantity(entry);
    const remaining = Math.max(1, Math.round((item.quantity - allocated) * 1000) / 1000);
    const defaultQty = item.quantity - allocated > EPS ? remaining : 1;

    const defaultWeights: Record<string, number> = {};
    participants.slice(0, 2).forEach((p) => {
      defaultWeights[p.id] = 1;
    });

    const newSplit: SharedItemSplit = {
      id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      quantity: defaultQty,
      mode: 'equal',
      participantWeights: defaultWeights,
    };

    updateItemEntry(item.id, (prev) => ({
      ...prev,
      sharedSplits: [...prev.sharedSplits, newSplit],
    }));
  };

  const handleUpdateSharedSplit = (
    itemId: string,
    splitId: string,
    updater: (split: SharedItemSplit) => SharedItemSplit
  ) => {
    updateItemEntry(itemId, (prev) => ({
      ...prev,
      sharedSplits: prev.sharedSplits.map((s) => (s.id === splitId ? updater(s) : s)),
    }));
  };

  const handleRemoveSharedSplit = (itemId: string, splitId: string) => {
    updateItemEntry(itemId, (prev) => ({
      ...prev,
      sharedSplits: prev.sharedSplits.filter((s) => s.id !== splitId),
    }));
  };

  const allItemsValid = items.every((item) => {
    const entry = getEntryForItem(item.id);
    const allocated = getAllocatedQuantity(entry);
    const splitsHaveParticipants = entry.sharedSplits.every((s) =>
      s.quantity <= EPS
        ? true
        : Object.values(s.participantWeights).some((w) => w > 0)
    );
    return Math.abs(allocated - item.quantity) <= EPS && splitsHaveParticipants;
  });

  return (
    <section className="card" aria-labelledby="allocation-step-title">
      <div className="card-header">
        <div>
          <h2 id="allocation-step-title" className="section-title">
            4. توزيع الأصناف والكميات على المشاركين
          </h2>
          <p className="section-subtitle">
            خصّص وحدات كاملة للأفراد، أو قسّم أي صنف (أو المتبقي منه) بين عدة أشخاص بالتساوي أو بنسب مخصصة.
          </p>
        </div>
      </div>

      <div className="allocation-items-list">
        {items.map((item) => {
          const entry = getEntryForItem(item.id);
          const allocated = getAllocatedQuantity(entry);
          const remaining = Math.round((item.quantity - allocated) * 1000) / 1000;
          const isExact = Math.abs(remaining) <= EPS;
          const isOver = remaining < -EPS;

          return (
            <div
              key={item.id}
              className={`allocation-card ${
                isExact
                  ? 'allocation-card-valid'
                  : isOver
                    ? 'allocation-card-over'
                    : 'allocation-card-pending'
              }`}
            >
              <div className="allocation-card-header">
                <div>
                  <h3 className="allocation-item-title">{item.name}</h3>
                  <p className="allocation-item-meta">
                    الكمية الكلية: <strong>{item.quantity}</strong> ×{' '}
                    {item.unitPrice.toFixed(2)} {currency} ={' '}
                    <strong>
                      {item.lineTotal.toFixed(2)} {currency}
                    </strong>
                  </p>
                </div>

                <div className="allocation-status-group">
                  {isExact ? (
                    <span className="status-pill status-pill-ok">
                      مكتمل التوزيع ({allocated} / {item.quantity}) ✓
                    </span>
                  ) : isOver ? (
                    <span className="status-pill status-pill-error">
                      كمية زائدة بـ {Math.abs(remaining)} ({allocated} / {item.quantity}) ⚠️
                    </span>
                  ) : (
                    <span className="status-pill status-pill-warn">
                      متبقي غير مخصص: {remaining} من {item.quantity}
                    </span>
                  )}
                </div>
              </div>

              <div className="allocation-quick-toolbar">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSplitEntireItemEqually(item)}
                >
                  🤝 تقسيم الصنف بالكامل بالتساوي على الجميع
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => handleAddSharedSplit(item)}
                >
                  + مشاركة وحدة/كمية بين أشخاص محددين
                </button>
                {(allocated > 0 || entry.sharedSplits.length > 0) && (
                  <button
                    type="button"
                    className="btn-link-danger"
                    onClick={() => handleClearItemAllocation(item.id)}
                  >
                    إعادة ضبط الصنف
                  </button>
                )}
              </div>

              <div className="direct-units-section">
                <h4 className="mini-heading">تخصيص وحدات فردية مباشرة:</h4>
                <div className="direct-units-grid">
                  {participants.map((p) => {
                    const currentQty = entry.directUnits[p.id] ?? 0;
                    return (
                      <div
                        key={p.id}
                        className={`direct-unit-box ${
                          currentQty > 0 ? 'direct-unit-active' : ''
                        }`}
                      >
                        <span className="direct-unit-name">{p.name}</span>
                        <div className="stepper-controls">
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() =>
                              handleSetDirectUnit(
                                item.id,
                                p.id,
                                Math.max(0, currentQty - 1)
                              )
                            }
                            disabled={currentQty <= 0}
                            aria-label={`إنقاص كمية ${p.name} في ${item.name}`}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="stepper-input"
                            value={currentQty}
                            onChange={(e) =>
                              handleSetDirectUnit(
                                item.id,
                                p.id,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            aria-label={`كمية ${p.name} في ${item.name}`}
                          />
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() =>
                              handleSetDirectUnit(item.id, p.id, currentQty + 1)
                            }
                            aria-label={`زيادة كمية ${p.name} في ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {entry.sharedSplits.length > 0 && (
                <div className="shared-splits-section">
                  <h4 className="mini-heading">مجموعات المشاركة المشتركة لهذا الصنف:</h4>
                  {entry.sharedSplits.map((split, sIdx) => {
                    const activeCount = Object.values(split.participantWeights).filter(
                      (w) => w > 0
                    ).length;

                    return (
                      <div key={split.id} className="shared-split-box">
                        <div className="shared-split-header">
                          <div className="shared-split-controls">
                            <span className="badge-info">مشاركة #{sIdx + 1}</span>
                            <label className="inline-label">
                              الكمية المشتركة:
                              <input
                                type="number"
                                min="0.1"
                                step="any"
                                className="form-input input-compact"
                                value={split.quantity}
                                onChange={(e) =>
                                  handleUpdateSharedSplit(item.id, split.id, (prev) => ({
                                    ...prev,
                                    quantity: Math.max(
                                      0,
                                      parseFloat(e.target.value) || 0
                                    ),
                                  }))
                                }
                              />
                            </label>

                            <label className="inline-label">
                              طريقة التقسيم:
                              <select
                                className="form-input input-compact"
                                value={split.mode}
                                onChange={(e) =>
                                  handleUpdateSharedSplit(item.id, split.id, (prev) => ({
                                    ...prev,
                                    mode: e.target.value as 'equal' | 'custom',
                                  }))
                                }
                              >
                                <option value="equal">بالتساوي</option>
                                <option value="custom">بنسب/حصص مخصصة</option>
                              </select>
                            </label>
                          </div>

                          <button
                            type="button"
                            className="btn-icon-danger"
                            onClick={() => handleRemoveSharedSplit(item.id, split.id)}
                          >
                            حذف المشاركة ✕
                          </button>
                        </div>

                        <div className="shared-participants-grid">
                          {participants.map((p) => {
                            const weight = split.participantWeights[p.id] ?? 0;
                            const isSelected = weight > 0;

                            return (
                              <div
                                key={p.id}
                                className={`shared-participant-chip ${
                                  isSelected ? 'shared-participant-selected' : ''
                                }`}
                              >
                                <label className="checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      handleUpdateSharedSplit(
                                        item.id,
                                        split.id,
                                        (prev) => ({
                                          ...prev,
                                          participantWeights: {
                                            ...prev.participantWeights,
                                            [p.id]: checked ? 1 : 0,
                                          },
                                        })
                                      );
                                    }}
                                  />
                                  <span>{p.name}</span>
                                </label>

                                {split.mode === 'custom' && isSelected && (
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="any"
                                    className="weight-input"
                                    value={weight}
                                    onChange={(e) => {
                                      const val = Math.max(
                                        0,
                                        parseFloat(e.target.value) || 0
                                      );
                                      handleUpdateSharedSplit(
                                        item.id,
                                        split.id,
                                        (prev) => ({
                                          ...prev,
                                          participantWeights: {
                                            ...prev.participantWeights,
                                            [p.id]: val,
                                          },
                                        })
                                      );
                                    }}
                                    aria-label={`حصة ${p.name}`}
                                    title="الحصة أو النسبة"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {activeCount === 0 && (
                          <p className="field-error-text">
                            يرجى اختيار مشارك واحد على الأقل في هذه المشاركة.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!allItemsValid && (
        <div className="alert alert-warning" role="status">
          يرجى التأكد من توزيع جميع كميات الأصناف بالكامل (دون نقص أو زيادة) قبل الانتقال للخطوة التالية.
        </div>
      )}

      <div className="step-footer">
        <button type="button" className="btn btn-outline" onClick={onBack}>
          → الرجوع للمشاركين
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={!allItemsValid}
        >
          التالي: إعدادات الضرائب والرسوم ←
        </button>
      </div>
    </section>
  );
}
