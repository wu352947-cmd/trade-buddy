import type {
  DataSourceHealthItem,
  DataSourcesHealthResponse,
} from "@trade-buddy/shared-types";

import {
  fetchWithTimeout,
  getProviderRuntimeHealth,
  getSecUserAgent,
  recordProviderSuccess,
  recordTransientFailure,
  StaleCache,
  type ProviderKey,
} from "./cache-limiter";
import { getAdapterEnvStatus } from "./providers";

const PROBE_CACHE = new StaleCache<DataSourcesHealthResponse>(2);
const PROBE_FRESH_TTL_MS = 30 * 1000;

interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  note?: string;
}

async function runLightweightProbe(
  url: string,
  headers: Record<string, string> = {},
  method: "GET" | "HEAD" = "HEAD"
): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method,
        headers,
      },
      4000
    );
    const latencyMs = Math.max(1, Date.now() - started);
    if (res.ok) {
      return { ok: true, latencyMs };
    }
    return {
      ok: false,
      latencyMs,
      note: `HTTP ${res.status}`,
    };
  } catch {
    return {
      ok: false,
      latencyMs: Math.max(1, Date.now() - started),
      note: "连接超时或当前离线",
    };
  }
}

function resolveRuntimeStatus(
  enabled: boolean,
  configured: boolean,
  providerKeys: ProviderKey[],
  probe?: ProbeResult
): {
  status: DataSourceHealthItem["status"];
  statusLabel: string;
  lastCheckedAt?: string;
  latencyMs?: number;
  note?: string;
} {
  if (!enabled) {
    return {
      status: "disabled",
      statusLabel: "已关闭",
      note: "已通过本地环境变量禁用",
    };
  }

  if (!configured) {
    return {
      status: "unknown",
      statusLabel: "未检测",
      note: "未配置对应密钥，不发起上游请求",
    };
  }

  if (probe) {
    return {
      status: probe.ok ? "online" : "failed",
      statusLabel: probe.ok ? "在线" : "最近失败",
      lastCheckedAt: new Date().toISOString(),
      latencyMs: probe.latencyMs,
      note: probe.note,
    };
  }

  let latestSuccess = 0;
  let latestError = 0;
  let lastErrorText: string | undefined;

  for (const pk of providerKeys) {
    const h = getProviderRuntimeHealth(pk);
    if (h.lastSuccessAt && h.lastSuccessAt > latestSuccess) {
      latestSuccess = h.lastSuccessAt;
    }
    if (h.lastErrorAt && h.lastErrorAt > latestError) {
      latestError = h.lastErrorAt;
      lastErrorText = h.lastError;
    }
  }

  if (latestSuccess > 0 && latestSuccess >= latestError) {
    return {
      status: "online",
      statusLabel: "在线",
      lastCheckedAt: new Date(latestSuccess).toISOString(),
    };
  }

  if (latestError > 0) {
    return {
      status: "failed",
      statusLabel: "最近失败",
      lastCheckedAt: new Date(latestError).toISOString(),
      note: lastErrorText,
    };
  }

  return {
    status: "unknown",
    statusLabel: "未检测",
  };
}

/**
 * 获取全部数据源的配置布尔状态与运行健康状态。
 * 严格安全约束：绝不返回任何密钥、Token 片段、环境变量原文或含认证参数的 URL。
 */
export async function getDataSourcesHealth(
  probe = false
): Promise<DataSourcesHealthResponse> {
  if (probe) {
    const cachedProbe = PROBE_CACHE.getFresh("probe");
    if (cachedProbe) return cachedProbe;
  }

  const env = getAdapterEnvStatus();
  const probeResults = new Map<string, ProbeResult>();

  if (probe) {
    const tasks: Array<Promise<void>> = [];

    if (env.fredPublicEnabled) {
      tasks.push(
        runLightweightProbe(
          "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500&cosd=2026-01-01",
          {},
          "HEAD"
        ).then((r) => {
          probeResults.set("fred", r);
          if (r.ok) recordProviderSuccess("fred");
          else recordTransientFailure("fred", r.note || "探测失败", 10);
        })
      );
    }

    if (env.publicFeedsEnabled) {
      tasks.push(
        runLightweightProbe(
          "https://www.federalreserve.gov/feeds/press_all.xml",
          {},
          "HEAD"
        ).then((r) => {
          probeResults.set("public_feeds", r);
          if (r.ok) recordProviderSuccess("public_rss");
          else recordTransientFailure("public_rss", r.note || "探测失败", 10);
        })
      );

      tasks.push(
        runLightweightProbe(
          "https://data.sec.gov/submissions/CIK0000320193.json",
          {
            "User-Agent": getSecUserAgent(),
            Accept: "application/json",
          },
          "HEAD"
        ).then((r) => {
          probeResults.set("sec_edgar", r);
          if (r.ok) recordProviderSuccess("sec_edgar");
          else recordTransientFailure("sec_edgar", r.note || "探测失败", 10);
        })
      );
    }

    await Promise.all(tasks);
  }

  const sources: DataSourceHealthItem[] = [
    {
      id: "fred",
      name: "FRED 官方公开源",
      purpose: "美股基准指数日线（SP500 / NASDAQCOM）及官方宏观发布日历",
      category: "public",
      requiresKey: false,
      configured: true,
      enabled: env.fredPublicEnabled,
      configLabel: env.fredPublicEnabled ? "无需密钥" : "已关闭",
      ...resolveRuntimeStatus(
        env.fredPublicEnabled,
        true,
        ["fred"],
        probeResults.get("fred")
      ),
    },
    {
      id: "public_feeds",
      name: "官方公开资讯 / 日历（美联储 · BLS · SEC RSS）",
      purpose: "全市场宏观资讯流与 BLS / FRED 官方经济日程（纯 XML/iCal，无爬虫）",
      category: "public",
      requiresKey: false,
      configured: true,
      enabled: env.publicFeedsEnabled,
      configLabel: env.publicFeedsEnabled ? "无需密钥" : "已关闭",
      ...resolveRuntimeStatus(
        env.publicFeedsEnabled,
        true,
        ["public_rss", "public_calendar"],
        probeResults.get("public_feeds")
      ),
    },
    {
      id: "sec_edgar",
      name: "SEC EDGAR（Submissions & CompanyFacts）",
      purpose: "美股官方公告、财报申报记录与 XBRL 结构化财务指标（无 Key 可用）",
      category: "public",
      requiresKey: false,
      configured: true,
      enabled: env.publicFeedsEnabled,
      configLabel: env.publicFeedsEnabled
        ? env.secUserAgentCustom
          ? "无需密钥（自定义 UA）"
          : "无需密钥（默认 UA）"
        : "已关闭",
      ...resolveRuntimeStatus(
        env.publicFeedsEnabled,
        true,
        ["sec_edgar"],
        probeResults.get("sec_edgar")
      ),
    },
    {
      id: "twelvedata",
      name: "Twelve Data Free",
      purpose: "美股与美股 ETF 的 60m 小时线、日线与延迟报价（8次/分，800次/天）",
      category: "api_key",
      requiresKey: true,
      configured: env.twelveDataConfigured,
      enabled: true,
      configLabel: env.twelveDataConfigured ? "已配置" : "未配置",
      ...resolveRuntimeStatus(true, env.twelveDataConfigured, ["twelvedata"]),
    },
    {
      id: "polygon",
      name: "Polygon.io Stocks Free",
      purpose: "美股与美股 ETF 的 60m/日线聚合、昨收与个股资讯（5次/分）",
      category: "api_key",
      requiresKey: true,
      configured: env.polygonConfigured,
      enabled: true,
      configLabel: env.polygonConfigured ? "已配置" : "未配置",
      ...resolveRuntimeStatus(true, env.polygonConfigured, ["polygon"]),
    },
    {
      id: "finnhub",
      name: "Finnhub Free",
      purpose: "美股参考报价、公司/全市场资讯、含前值预测的经济与财报日历（60次/分）",
      category: "api_key",
      requiresKey: true,
      configured: env.finnhubConfigured,
      enabled: true,
      configLabel: env.finnhubConfigured ? "已配置" : "未配置",
      ...resolveRuntimeStatus(true, env.finnhubConfigured, ["finnhub"]),
    },
    {
      id: "eodhd",
      name: "EODHD Free",
      purpose: "美股与港股少量自选收盘日线 EOD（20次/天，严格缓存）",
      category: "api_key",
      requiresKey: true,
      configured: env.eodhdConfigured,
      enabled: true,
      configLabel: env.eodhdConfigured ? "已配置" : "未配置",
      ...resolveRuntimeStatus(true, env.eodhdConfigured, ["eodhd"]),
    },
    {
      id: "tushare",
      name: "Tushare Pro",
      purpose: "A 股收盘日线 EOD 及可选财务报表（需个人合法 Token）",
      category: "api_key",
      requiresKey: true,
      configured: env.tushareConfigured,
      enabled: true,
      configLabel: env.tushareConfigured ? "已配置" : "未配置",
      ...resolveRuntimeStatus(true, env.tushareConfigured, ["tushare"]),
    },
    {
      id: "baostock",
      name: "Baostock（本地 Python 适配器）",
      purpose: "可选本地 A 股开源日线（默认关闭，需本机安装 baostock 并开启开关）",
      category: "local_optional",
      requiresKey: false,
      configured: env.baostockEnabled,
      enabled: env.baostockEnabled,
      configLabel: env.baostockEnabled ? "已配置（已启用）" : "未配置（未启用）",
      ...resolveRuntimeStatus(env.baostockEnabled, env.baostockEnabled, ["baostock"]),
    },
  ];

  const response: DataSourcesHealthResponse = {
    sources,
    probed: probe,
    checkedAt: new Date().toISOString(),
  };

  if (probe) {
    PROBE_CACHE.set("probe", response, PROBE_FRESH_TTL_MS, 5 * 60 * 1000);
  }

  return response;
}
