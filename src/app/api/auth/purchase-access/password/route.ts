import { NextRequest } from 'next/server';
import { finishPurchaseAccess } from '@/lib/purchase-access/password';
export async function POST(req: NextRequest) { return finishPurchaseAccess(req, true); }
