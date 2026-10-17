# احسبهالي (Ehsebhaly) — AI Bill Splitter Monorepo

تطبيق ويب متكامل لتقسيم فواتير المطاعم بالذكاء الاصطناعي (**Google Gemini Vision**) مبني بهندسة **Monorepo (npm workspaces)** باستخدام **Next.js (App Router)** و **TypeScript** الصارم.

---

## 1. هيكل المشروع (Monorepo Architecture)

```text
ala-ehasaeb/
├── apps/
│   └── web/                          # @ehsebhaly/web — تطبيق Next.js (App Router) + الواجهة العربية RTL
│       ├── app/
│       │   ├── layout.tsx            # تخطيط RTL باللغة العربية
│       │   ├── page.tsx              # خطوات العمل الـ 6 وإدارة الحالة في React State
│       │   ├── globals.css           # تصميم متجاوب وواجهة طباعة نظيفة
│       │   └── api/
│       │       ├── health/route.ts           # GET /api/health
│       │       └── receipts/parse/route.ts   # POST /api/receipts/parse
│       └── components/
│           ├── ReceiptUploader.tsx   # 1. رفع صورة الفاتورة أو الإدخال اليدوي
│           ├── ReceiptEditor.tsx     # 2. مراجعة وتعديل الأصناف والرسوم المستخرجة
│           ├── ParticipantsForm.tsx  # 3. إضافة وتعديل المشاركين
│           ├── ItemAllocation.tsx    # 4. توزيع الأصناف (وحدات فردية + مشاركة متساوية/مخصصة)
│           ├── FeeSettings.tsx       # 5. إعدادات التوصيل والضرائب والخدمة والخصومات والتسوية
│           └── ResultsSummary.tsx    # 6. النتيجة النهائية، النسخ، المشاركة عبر واتساب، والطباعة
├── packages/
│   ├── types/                        # @ehsebhaly/types — تعريفات TypeScript الصارمة المشتركة
│   ├── schemas/                      # @ehsebhaly/schemas — مخططات Zod للتحقق والتدقيق المستقل للفاتورة
│   ├── calculations/                 # @ehsebhaly/calculations — محرك الحسابات المالية الحتمي (Pure TS)
│   └── ai/                           # @ehsebhaly/ai — محلل صور الفواتير عبر Google Gemini Vision API
├── lib/                              # نقاط تصدير موحدة للحزم المشتركة
├── tests/
│   └── bill-calculator.test.ts       # اختبارات شاملة لمحرك الحسابات و Gemini والـ API
├── .env.example                      # نموذج متغيرات البيئة للخادم فقط
└── package.json                      # إعدادات npm workspaces وأوامر التشغيل الموحدة
```

---

## 2. إعداد متغيرات البيئة (Gemini Vision API)

انسخ ملف `.env.example` إلى `apps/web/.env.local` (أو `.env.local` في الجذر):

```bash
cp .env.example apps/web/.env.local
```

ثم أضف مفتاح **Google Gemini API** الخاص بك:

```env
AI_API_KEY=your_gemini_api_key_here
AI_MODEL=gemini-2.5-flash
```

- **الأمان والخصوصية:** لا يتم استخدام بادئة `NEXT_PUBLIC_` مطلقاً مع المفاتيح السرية، ولا يتم استدعاء Gemini من المتصفح مباشرة، ولا يتم تخزين صور الفواتير أو بياناتها في قاعدة بيانات أو `localStorage`.
- **الوضع اليدوي (Manual Fallback):** يعمل التطبيق بالكامل بدون مفتاح API عبر الإدخال اليدوي للفاتورة أو تحميل المثال الجاهز.

---

## 3. التشغيل والبناء والاختبار

من المجلد الرئيسي للـ Monorepo:

```bash
# تثبيت الحزم وربط حزم الـ Monorepo
npm install

# تشغيل بيئة التطوير (Next.js)
npm run dev

# فحص الأنواع الصارم في جميع الحزم (Strict TypeScript Check)
npm run typecheck

# تشغيل الاختبارات الآلية (Vitest)
npm test

# بناء نسخة الإنتاج (Production Build)
npm run build
```

---

## 4. محرك الحسابات المالية واستراتيجية التسوية (Financial Engine)

يقع المحرك المالي في الحزمة المستقلة `@ehsebhaly/calculations` ([`packages/calculations/src/bill-calculator.ts`](packages/calculations/src/bill-calculator.ts)) ولا يعتمد على React أو مزود الذكاء الاصطناعي:

1. **الحساب بالوحدات الصغرى الصحيحة (Integer Minor Units):**
   يتم تحويل جميع المبالغ إلى القروش/الهللات الصحيحة (`1 EGP = 100 piasters`) لتجنب أخطاء الفاصلة العائمة (`IEEE-754 floating-point errors`).
2. **توزيع البواقي غير القابلة للقسمة (Largest-Remainder / Hamilton Method):**
   عند تقسيم مبلغ مثل `100.00 EGP` (`10000` قرش) على 3 أشخاص بالتساوي، يحصل كل شخص على الجزء الصحيح `3333` قرشاً، ويُوزع القرش المتبقي (`1` قرش) بشكل حتمي حسب أكبر باقٍ كسري ثم ترتيب المشاركين (`3334 + 3333 + 3333 = 10000` قرش بالضبط).
3. **منع ازدواجية الضرائب ودعم الأسعار الشاملة للضريبة (`Tax-Inclusive`):**
   - يُفضّل المحرك مبلغ الضريبة الفعلي المطبوع على الفاتورة عند توفره.
   - إذا كانت أسعار الأصناف شاملة الضريبة (`isTaxInclusive = true`)، يتم عرض حصة الضريبة الضمنية كمعلومة دون إضافتها مرة ثانية على المجموع.
4. **مطابقة إجمالي الفاتورة النهائي:**
   مجموع ما يدفعه المشاركون بالوحدات الصغرى يطابق تماماً إجمالي الفاتورة النهائي المتفق عليه.
