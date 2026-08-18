import { NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runHealthChecks();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
