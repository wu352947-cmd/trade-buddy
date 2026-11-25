import { NextRequest, NextResponse } from "next/server";
import {
  getAdapterEnvStatus,
  getWatchlistSummaries,
  searchCatalog,
} from "@trade-buddy/market-adapters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const market = searchParams.get("market") || "ALL";

  if (q || market !== "ALL") {
    const matched = searchCatalog(q, market);
    return NextResponse.json({
      symbols: matched,
      envStatus: getAdapterEnvStatus(),
    });
  }

  return NextResponse.json({
    watchlist: getWatchlistSummaries(),
    envStatus: getAdapterEnvStatus(),
  });
}
