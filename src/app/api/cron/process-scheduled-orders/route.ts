import { NextResponse } from 'next/server';

/**
 * POST /api/cron/process-scheduled-orders
 *
 * Scheduled orders feature has been permanently disabled.
 * Customers can only place immediate orders during operating hours.
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Scheduled orders feature is disabled.',
  });
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Scheduled orders feature is disabled.',
  });
}
