import { getDataSourcesHealth } from "@trade-buddy/market-adapters";
import { SettingsView } from "@/components/settings/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const initialHealth = await getDataSourcesHealth(false);
  return <SettingsView initialHealth={initialHealth} />;
}
