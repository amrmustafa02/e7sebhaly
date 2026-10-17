import type { ReceiptData } from '@ehsebhaly/types';
import { validateAndReconcileReceipt } from '@ehsebhaly/schemas';
import { ZodError } from 'zod';

export type ReceiptParserErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_IMAGE'
  | 'AI_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'MALFORMED_AI_RESPONSE';

export class ReceiptParserError extends Error {
  public readonly code: ReceiptParserErrorCode;
  public readonly statusCode: number;

  constructor(message: string, code: ReceiptParserErrorCode, statusCode = 500) {
    super(message);
    this.name = 'ReceiptParserError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ParseReceiptImageOptions {
  imageBuffer: Uint8Array;
  mimeType: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ParseReceiptImageResult {
  receipt: ReceiptData;
  reconciliationWarnings: string[];
}

const PLACEHOLDER_KEYS = new Set([
  '',
  'your_api_key_here',
  'your_gemini_api_key_here',
  'replace_me',
]);

const PLACEHOLDER_MODELS = new Set([
  '',
  'your_vision_model_here',
]);

export const DEFAULT_GEMINI_VISION_MODEL = 'gemini-flash-lite-latest';

export function isAiConfigured(
  envApiKey: string | undefined = process.env.AI_API_KEY ?? process.env.GEMINI_API_KEY
): boolean {
  if (!envApiKey) return false;
  const trimmed = envApiKey.trim();
  return trimmed.length > 0 && !PLACEHOLDER_KEYS.has(trimmed.toLowerCase());
}

export function resolveGeminiModel(
  envModel: string | undefined = process.env.AI_MODEL
): string {
  if (!envModel) return DEFAULT_GEMINI_VISION_MODEL;
  const trimmed = envModel.trim();
  if (PLACEHOLDER_MODELS.has(trimmed.toLowerCase())) {
    return DEFAULT_GEMINI_VISION_MODEL;
  }
  return trimmed;
}

const RECEIPT_EXTRACTION_SYSTEM_PROMPT = `أنت خبير دقيق في قراءة فواتير المطاعم باللغتين العربية والإنجليزية.
قم باستخراج الأرقام والأصناف المكتوبة في صورة الفاتورة فقط بصيغة JSON.

قواعد صارمة:
1. لا تخترع أو تحسب من عندك أي ضرائب أو خدمة أو توصيل غير مكتوبة صراحةً في الفاتورة.
2. إذا كانت الفاتورة مكتوباً فيها ضريبة القيمة المضافة (مثلاً 14% أو مبلغ مطبوع) أو رسوم خدمة (مثلاً 12% أو مبلغ مطبوع) أو توصيل (Delivery)، استخرج المبلغ المطبوع والنسبة كما هي مكتوبة في الفاتورة تماماً. إذا لم تكن موجودة في الفاتورة اجعلها 0.
3. استخرج كل صنف (name, quantity, unitPrice, lineTotal).
4. إذا كان أي رقم غير واضح في الصورة، ضع uncertain: true وأضفه في uncertainFields.
5. العملة الافتراضية EGP إلا إذا ظهر رمز عملة آخر (SAR, AED, USD, KWD).

يجب أن يكون الرد JSON صالحاً فقط بالشكل التالي:
{
  "restaurantName": "string",
  "currency": "EGP",
  "items": [
    {
      "id": "item-1",
      "name": "string",
      "quantity": 1,
      "unitPrice": 100,
      "lineTotal": 100,
      "itemDiscount": 0,
      "itemTax": 0,
      "isTaxInclusive": false,
      "uncertain": false,
      "uncertaintyNote": ""
    }
  ],
  "subtotal": 100,
  "discountAmount": 0,
  "discountPercentage": null,
  "taxAmount": 0,
  "taxPercentage": null,
  "isTaxInclusive": false,
  "serviceChargeAmount": 0,
  "serviceChargePercentage": null,
  "deliveryFee": 0,
  "otherFees": 0,
  "roundingAdjustment": 0,
  "finalTotal": 100,
  "uncertainFields": [
    {
      "field": "string",
      "reason": "string",
      "suggestedValue": null
    }
  ]
}`;

/**
 * Strips markdown code fences if the AI model wrapped the JSON output.
 */
export function extractJsonFromText(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Extracts structured receipt data from an image using Google Gemini Vision API,
 * validates the result at runtime with Zod, and independently reconciles receipt totals.
 */
export async function parseReceiptWithGemini(
  options: ParseReceiptImageOptions
): Promise<ParseReceiptImageResult> {
  const rawApiKey =
    options.apiKey ?? process.env.AI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
  const apiKey = rawApiKey.trim();

  if (!isAiConfigured(apiKey)) {
    throw new ReceiptParserError(
      'مفتاح الذكاء الاصطناعي (AI_API_KEY) غير مُعد على الخادم. يمكنك إدخال الفاتورة يدوياً.',
      'MISSING_API_KEY',
      503
    );
  }

  if (!options.imageBuffer || options.imageBuffer.byteLength === 0) {
    throw new ReceiptParserError(
      'ملف الصورة فارغ أو غير صالح.',
      'INVALID_IMAGE',
      400
    );
  }

  const model = resolveGeminiModel(options.model ?? process.env.AI_MODEL);
  const timeoutMs = options.timeoutMs ?? 60_000;
  const fetchFn = options.fetchImpl ?? fetch;

  const base64Image = Buffer.from(options.imageBuffer).toString('base64');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: RECEIPT_EXTRACTION_SYSTEM_PROMPT },
              {
                inlineData: {
                  mimeType: options.mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'))
    ) {
      throw new ReceiptParserError(
        'انتهت مهلة الاتصال بخدمة الذكاء الاصطناعي. يرجى المحاولة مرة أخرى أو الإدخال اليدوي.',
        'AI_TIMEOUT',
        504
      );
    }
    throw new ReceiptParserError(
      'تعذر الاتصال بخدمة Gemini للذكاء الاصطناعي. يرجى التحقق من الشبكة أو استخدام الإدخال اليدوي.',
      'AI_PROVIDER_ERROR',
      502
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new ReceiptParserError(
        'مفتاح Gemini API غير صالح أو غير مصرح له. يرجى التحقق من إعدادات الخادم أو الإدخال اليدوي.',
        'AI_PROVIDER_ERROR',
        502
      );
    }
    if (status === 429) {
      throw new ReceiptParserError(
        'تم تجاوز حد الطلبات المسموح به لخدمة الذكاء الاصطناعي. يرجى المحاولة بعد قليل أو الإدخال اليدوي.',
        'AI_PROVIDER_ERROR',
        429
      );
    }
    throw new ReceiptParserError(
      `فشل تحليل الفاتورة من مزود الذكاء الاصطناعي (رمز الحالة ${status}). يمكنك المتابعة بالإدخال اليدوي.`,
      'AI_PROVIDER_ERROR',
      502
    );
  }

  let payload: GeminiGenerateContentResponse;
  try {
    payload = (await response.json()) as GeminiGenerateContentResponse;
  } catch {
    throw new ReceiptParserError(
      'استجابة غير صالحة من خدمة الذكاء الاصطناعي.',
      'MALFORMED_AI_RESPONSE',
      502
    );
  }

  const rawText = payload.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!rawText) {
    throw new ReceiptParserError(
      'لم يتمكن الذكاء الاصطناعي من قراءة محتوى الصورة. يرجى تجربة صورة أوضح أو الإدخال اليدوي.',
      'MALFORMED_AI_RESPONSE',
      422
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonFromText(rawText));
  } catch {
    throw new ReceiptParserError(
      'أرجع نموذج الذكاء الاصطناعي بيانات بتنسيق غير صالح. يرجى المحاولة مجدداً أو الإدخال اليدوي.',
      'MALFORMED_AI_RESPONSE',
      422
    );
  }

  try {
    return validateAndReconcileReceipt(parsedJson);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      throw new ReceiptParserError(
        'البيانات المستخرجة من الفاتورة غير مكتملة أو لا تطابق الهيكل المطلوب.',
        'MALFORMED_AI_RESPONSE',
        422
      );
    }
    throw new ReceiptParserError(
      'حدث خطأ أثناء التحقق من بيانات الفاتورة المستخرجة.',
      'MALFORMED_AI_RESPONSE',
      422
    );
  }
}
