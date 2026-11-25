import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_SYMBOL_ID,
  getFundamentalsForSymbol,
} from "@trade-buddy/market-adapters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || DEFAULT_SYMBOL_ID;
  const refresh = searchParams.get("refresh") === "1";

  const data = await getFundamentalsForSymbol(symbol, refresh);
  return NextResponse.json(data);
}
