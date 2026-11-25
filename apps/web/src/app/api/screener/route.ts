import { NextRequest, NextResponse } from "next/server";
import { getScreenerData } from "@trade-buddy/market-adapters";
import { MarketCategorySchema, type MarketCategory } from "@trade-buddy/shared-types";

export const dynamic = "force-dynamic";

function parseOptionalNumber(raw: string | null): number | undefined {
  if (!raw || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseMaFilter(raw: string | null): "all" | "above" | "below" {
  if (raw === "above" || raw === "below") return raw;
  return "all";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawMarket = searchParams.get("market");
  let market: MarketCategory | "ALL" = "ALL";
  if (rawMarket && rawMarket !== "ALL") {
    const parsed = MarketCategorySchema.safeParse(rawMarket);
    if (parsed.success) market = parsed.data;
  }

  const data = await getScreenerData({
    market,
    minChangePct: parseOptionalNumber(searchParams.get("minChangePct")),
    maxChangePct: parseOptionalNumber(searchParams.get("maxChangePct")),
    minPrice: parseOptionalNumber(searchParams.get("minPrice")),
    maxPrice: parseOptionalNumber(searchParams.get("maxPrice")),
    minVolume: parseOptionalNumber(searchParams.get("minVolume")),
    minTurnover: parseOptionalNumber(searchParams.get("minTurnover")),
    ma20: parseMaFilter(searchParams.get("ma20")),
    ma60: parseMaFilter(searchParams.get("ma60")),
    refresh: searchParams.get("refresh") === "1",
  });

  return NextResponse.json(data);
}
