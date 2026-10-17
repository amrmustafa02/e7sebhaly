import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'احسبهالي — تقسيم فواتير المطاعم بالذكاء الاصطناعي',
  description:
    'تطبيق ويب ذكي لتقسيم فواتير المطاعم بدقة محاسبية عالية باستخدام Gemini Vision، يدعم التقسيم الفردي والمشترك ومشاركة النتائج عبر واتساب.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
