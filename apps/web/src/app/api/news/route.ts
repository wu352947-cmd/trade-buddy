import { NextRequest, NextResponse } from "next/server";
import { NewsScopeSchema } from "@trade-buddy/shared-types";
import { getNewsFeed } from "@trade-buddy/market-adapters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawScope = searchParams.get("scope") || "symbol";
  const symbol = searchParams.get("symbol") || undefined;
  const refresh = searchParams.get("refresh") === "1";

  const parsedScope = NewsScopeSchema.safeParse(rawScope);
  const scope = parsedScope.success ? parsedScope.data : "symbol";

  try {
    const data = await getNewsFeed(scope, symbol, refresh);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      {
        scope,
        symbolId: symbol,
        items: [],
        sources: [],
        delayNote: "服务端请求资讯流异常，请稍后重试。",
        mode: "empty",
        fetchedAt: new Date().toISOString(),
        emptyHint: "获取资讯流时发生临时错误，请点击重试。",
      },
      { status: 200 }
    );
  }
}
