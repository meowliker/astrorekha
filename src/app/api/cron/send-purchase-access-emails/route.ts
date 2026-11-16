import { NextRequest, NextResponse } from 'next/server';
import { sendPurchaseAccessEmails } from '@/lib/purchase-access/email';
export const maxDuration = 60;
export async function GET(req: NextRequest) {
    if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        return NextResponse.json(await sendPurchaseAccessEmails());
    }
    catch {
        return NextResponse.json({ error: 'Purchase access email queue unavailable' }, { status: 503 });
    }
}
