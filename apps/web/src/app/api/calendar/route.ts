import { NextRequest, NextResponse } from "next/server";
import { getEconomicCalendar } from "@trade-buddy/market-adapters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawDays = Number(searchParams.get("days") || "14");
  const days = Number.isFinite(rawDays) ? rawDays : 14;
  const symbol = searchParams.get("symbol") || undefined;
  const refresh = searchParams.get("refresh") === "1";

  try {
    const data = await getEconomicCalendar(days, symbol, refresh);
    return NextResponse.json(data);
  } catch {
    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json(
      {
        from: today,
        to: today,
        symbolId: symbol,
        events: [],
        sources: [],
        delayNote: "服务端请求经济日历异常，请稍后重试。",
        mode: "empty",
        fetchedAt: new Date().toISOString(),
        emptyHint: "获取经济日历时发生临时错误，请点击重试。",
      },
      { status: 200 }
    );
  }
}
