import { NextRequest, NextResponse } from "next/server";
import { getDataSourcesHealth } from "@trade-buddy/market-adapters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const probe = searchParams.get("probe") === "1";

  const data = await getDataSourcesHealth(probe);
  return NextResponse.json(data);
}
