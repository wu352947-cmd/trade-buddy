import { NextRequest, NextResponse } from "next/server";
import { IntervalSchema } from "@trade-buddy/shared-types";
import { DEFAULT_SYMBOL_ID, getBarsForSymbol } from "@trade-buddy/market-adapters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || DEFAULT_SYMBOL_ID;
  const rawInterval = searchParams.get("interval") || "1D";

  const parsedInterval = IntervalSchema.safeParse(rawInterval);
  const interval = parsedInterval.success ? parsedInterval.data : "1D";

  const data = await getBarsForSymbol(symbol, interval);
  return NextResponse.json(data);
}
