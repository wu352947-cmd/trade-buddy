import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_SYMBOL_ID, getQuoteForSymbol } from "@trade-buddy/market-adapters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || DEFAULT_SYMBOL_ID;

  try {
    const data = await getQuoteForSymbol(symbol);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "获取最新报价失败，请稍后重试" },
      { status: 500 }
    );
  }
}
