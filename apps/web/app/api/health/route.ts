import { NextResponse } from 'next/server';
import { isAiConfigured, resolveGeminiModel } from '@ehsebhaly/ai';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const aiConfigured = isAiConfigured();
  const model = resolveGeminiModel();

  return NextResponse.json(
    {
      status: 'ok',
      service: 'ehsebhaly-api',
      aiConfigured,
      provider: 'gemini',
      model: aiConfigured ? model : null,
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
