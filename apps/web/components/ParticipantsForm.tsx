'use client';

import React, { useState } from 'react';
import type { Participant } from '@ehsebhaly/types';

export interface ParticipantsFormProps {
  participants: Participant[];
  onChangeParticipants: (participants: Participant[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ParticipantsForm({
  participants,
  onChangeParticipants,
  onBack,
  onNext,
}: ParticipantsFormProps) {
  const [nameInput, setNameInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const addParticipantByName = (rawName: string) => {
    const trimmed = rawName.trim();
    if (!trimmed) {
      setErrorMsg('يرجى كتابة اسم المشارك.');
      return;
    }

    const exists = participants.some(
      (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setErrorMsg(`المشارك "${trimmed}" مضاف بالفعل.`);
      return;
    }

    const newParticipant: Participant = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
    };

    setErrorMsg(null);
    setNameInput('');
    onChangeParticipants([...participants, newParticipant]);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addParticipantByName(nameInput);
  };

  const handleRename = (id: string, newName: string) => {
    onChangeParticipants(
      participants.map((p) => (p.id === id ? { ...p, name: newName } : p))
    );
  };

  const handleRemove = (id: string) => {
    onChangeParticipants(participants.filter((p) => p.id !== id));
  };

  const validParticipants =
    participants.length > 0 && participants.every((p) => p.name.trim().length > 0);

  return (
    <section className="card" aria-labelledby="participants-step-title">
      <div className="card-header">
        <div>
          <h2 id="participants-step-title" className="section-title">
            3. إضافة المشاركين في الفاتورة
          </h2>
          <p className="section-subtitle">
            أضف أسماء الأشخاص المشاركين في الطلب لتخصيص الأصناف لكل شخص أو مشاركتها بينهم.
          </p>
        </div>
        <span className="status-pill status-pill-ok">
          عدد المشاركين: {participants.length}
        </span>
      </div>

      <form onSubmit={handleFormSubmit} className="participant-add-form">
        <input
          type="text"
          className="form-input"
          placeholder="اكتب اسم المشارك ثم اضغط إضافة..."
          value={nameInput}
          onChange={(e) => {
            setNameInput(e.target.value);
            if (errorMsg) setErrorMsg(null);
          }}
          aria-label="اسم المشارك الجديد"
        />
        <button type="submit" className="btn btn-primary">
          + إضافة مشارك
        </button>
      </form>

      {errorMsg && (
        <div className="alert alert-error" role="alert">
          {errorMsg}
        </div>
      )}

      {participants.length === 0 ? (
        <div className="empty-state">
          <p>لم يتم إضافة أي مشاركين بعد. اكتب اسم كل مشارك بالأعلى واضغط إضافة.</p>
        </div>
      ) : (
        <div className="participants-list">
          {participants.map((p, idx) => (
            <div key={p.id} className="participant-row">
              <span className="participant-avatar" aria-hidden="true">
                {idx + 1}
              </span>
              <input
                type="text"
                className="form-input participant-name-input"
                value={p.name}
                onChange={(e) => handleRename(p.id, e.target.value)}
                aria-label={`اسم المشارك رقم ${idx + 1}`}
              />
              <button
                type="button"
                className="btn-icon-danger"
                onClick={() => handleRemove(p.id)}
                aria-label={`حذف المشارك ${p.name}`}
              >
                حذف ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="step-footer">
        <button type="button" className="btn btn-outline" onClick={onBack}>
          → الرجوع للأصناف
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={!validParticipants}
        >
          التالي: توزيع الأصناف ←
        </button>
      </div>
    </section>
  );
}
