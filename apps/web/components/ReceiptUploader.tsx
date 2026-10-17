'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { ParseReceiptApiResponse, ReceiptData } from '@ehsebhaly/types';

export interface ReceiptUploaderProps {
  onReceiptExtracted: (receipt: ReceiptData, warnings: string[]) => void;
  onStartManual: () => void;
  onLoadDemoExample: () => void;
}

/**
 * Compresses and resizes large receipt images on the client (max 1600px, JPEG 0.85)
 * so AI Vision extraction completes in a few seconds without timing out on huge phone photos.
 */
async function optimizeReceiptImage(file: File): Promise<File | Blob> {
  if (file.size <= 350 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const MAX_DIM = 1600;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size > 0 && blob.size < file.size) {
              resolve(new File([blob], 'receipt.jpg', { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.85
        );
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export function ReceiptUploader({
  onReceiptExtracted,
  onStartManual,
  onLoadDemoExample,
}: ReceiptUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    checked: boolean;
    aiConfigured: boolean;
    model: string | null;
  }>({
    checked: false,
    aiConfigured: true,
    model: null,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { aiConfigured?: boolean; model?: string | null }) => {
        if (active) {
          setAiStatus({
            checked: true,
            aiConfigured: Boolean(data.aiConfigured),
            model: data.model ?? null,
          });
        }
      })
      .catch(() => {
        if (active) {
          setAiStatus({ checked: true, aiConfigured: false, model: null });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setErrorMsg(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!file) {
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleAnalyzeReceipt = async () => {
    if (!selectedFile) {
      setErrorMsg('يرجى اختيار صورة الفاتورة أولاً.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const optimized = await optimizeReceiptImage(selectedFile);
      const formData = new FormData();
      formData.append('receipt', optimized);

      const response = await fetch('/api/receipts/parse', {
        method: 'POST',
        body: formData,
      });

      const result = (await response.json()) as ParseReceiptApiResponse;

      if (!response.ok || !result.success || !result.data) {
        setErrorMsg(
          result.error ??
            'تعذر استخراج بيانات الفاتورة بالذكاء الاصطناعي. يمكنك المتابعة بالإدخال اليدوي.'
        );
        return;
      }

      onReceiptExtracted(result.data, result.reconciliationWarnings ?? []);
    } catch {
      setErrorMsg(
        'حدث خطأ في الاتصال بالخادم أثناء تحليل الفاتورة. يمكنك استخدام الإدخال اليدوي.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="card" aria-labelledby="upload-step-title">
      <div className="card-header">
        <div>
          <h2 id="upload-step-title" className="section-title">
            1. رفع صورة الفاتورة أو الإدخال اليدوي
          </h2>
          <p className="section-subtitle">
            ارفع صورة فاتورة المطعم لقراءتها تلقائياً، أو أدخل الأصناف يدوياً بسهولة.
          </p>
        </div>
        {aiStatus.checked && (
          <span
            className={`status-pill ${
              aiStatus.aiConfigured ? 'status-pill-ok' : 'status-pill-warn'
            }`}
          >
            {aiStatus.aiConfigured ? 'الذكاء الاصطناعي جاهز ✓' : 'الوضع اليدوي'}
          </span>
        )}
      </div>

      <div
        className="upload-dropzone"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="اختر صورة فاتورة المطعم"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={handleFileChange}
          className="sr-only"
          aria-label="ملف صورة الفاتورة"
        />
        <div className="upload-icon" aria-hidden="true">
          📷
        </div>
        <p className="upload-title">
          {selectedFile ? selectedFile.name : 'اضغط لتصوير الفاتورة أو اختيار صورتها'}
        </p>
        <p className="upload-hint">يدعم جميع صور الفواتير ولقطات الشاشة</p>
      </div>

      {previewUrl && (
        <div className="receipt-preview-box">
          <img
            src={previewUrl}
            alt="معاينة صورة الفاتورة المختارة"
            className="receipt-preview-img"
          />
          <div className="receipt-preview-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAnalyzeReceipt}
              disabled={isUploading}
            >
              {isUploading
                ? '⏳ جاري قراءة الفاتورة...'
                : '✨ اقرأ الفاتورة بالذكاء الاصطناعي'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              disabled={isUploading}
            >
              تغيير الصورة
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="alert alert-error" role="alert">
          <p>{errorMsg}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onStartManual}
          >
            المتابعة بالإدخال اليدوي ←
          </button>
        </div>
      )}

      <div className="divider-text">
        <span>أو ابدأ مباشرة</span>
      </div>

      <div className="action-row-center">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onStartManual}
          disabled={isUploading}
        >
          ✍️ إدخال الفاتورة يدوياً
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={onLoadDemoExample}
          disabled={isUploading}
        >
          🥪 تجربة مثال جاهز (5 سندوتشات)
        </button>
      </div>
    </section>
  );
}
