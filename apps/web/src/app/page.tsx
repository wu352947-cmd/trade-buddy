import {
  DEFAULT_SYMBOL_ID,
  getAdapterEnvStatus,
  getBarsForSymbol,
  getWatchlistSummaries,
} from "@trade-buddy/market-adapters";
import { TerminalWorkspace } from "@/components/workspace/TerminalWorkspace";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [initialBars, watchlist] = await Promise.all([
    getBarsForSymbol(DEFAULT_SYMBOL_ID, "1D"),
    Promise.resolve(getWatchlistSummaries()),
  ]);
  const envStatus = getAdapterEnvStatus();

  return (
    <TerminalWorkspace
      initialData={initialBars}
      initialWatchlist={watchlist}
      envStatus={envStatus}
    />
  );
}
