import { NextResponse } from 'next/server';
import {
  parseReceiptWithGemini,
  ReceiptParserError,
} from '@ehsebhaly/ai';
import type { ParseReceiptApiResponse } from '@ehsebhaly/types';

export const runtime = 'nodejs';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(
  request: Request
): Promise<NextResponse<ParseReceiptApiResponse>> {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_CONTENT_TYPE',
          error: 'يجب إرسال الطلب بصيغة multipart/form-data مع إرفاق صورة الفاتورة.',
        },
        { status: 400 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_FORM_DATA',
          error: 'تعذر قراءة بيانات النموذج المرسلة.',
        },
        { status: 400 }
      );
    }

    const uploaded =
      formData.get('receipt') ?? formData.get('file') ?? formData.get('image');

    if (!uploaded || typeof uploaded === 'string' || !('arrayBuffer' in uploaded)) {
      return NextResponse.json(
        {
          success: false,
          code: 'MISSING_FILE',
          error: 'يرجى اختيار صورة فاتورة لرفعها.',
        },
        { status: 400 }
      );
    }

    const mimeType = (uploaded.type || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        {
          success: false,
          code: 'UNSUPPORTED_MIME_TYPE',
          error: 'صيغة الملف غير مدعومة. يرجى رفع صورة بصيغة JPG أو PNG أو WEBP أو HEIC.',
        },
        { status: 415 }
      );
    }

    if (uploaded.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'EMPTY_FILE',
          error: 'ملف الصورة المرفوع فارغ.',
        },
        { status: 400 }
      );
    }

    if (uploaded.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          code: 'FILE_TOO_LARGE',
          error: 'حجم الصورة يتجاوز الحد الأقصى المسموح به (10 ميجابايت).',
        },
        { status: 413 }
      );
    }

    const arrayBuffer = await uploaded.arrayBuffer();
    const imageBuffer = new Uint8Array(arrayBuffer);

    const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;

    const { receipt, reconciliationWarnings } = await parseReceiptWithGemini({
      imageBuffer,
      mimeType: normalizedMime,
    });

    return NextResponse.json(
      {
        success: true,
        data: receipt,
        reconciliationWarnings,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof ReceiptParserError) {
      return NextResponse.json(
        {
          success: false,
          code: err.code,
          error: err.message,
        },
        { status: err.statusCode }
      );
    }

    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        error: 'حدث خطأ غير متوقع أثناء معالجة الفاتورة. يرجى المحاولة مرة أخرى أو الإدخال اليدوي.',
      },
      { status: 500 }
    );
  }
}
