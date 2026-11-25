import {
  WorkspaceTemplateExportBundleSchema,
  WorkspaceTemplateExportSingleSchema,
  WorkspaceTemplateSchema,
  WorkspaceTemplatesStoreSchema,
  type WorkspaceTemplate,
  type WorkspaceTemplateExportBundle,
  type WorkspaceTemplateExportSingle,
  type WorkspaceTemplatesStore,
} from "@trade-buddy/shared-types";

export const WORKSPACE_TEMPLATES_STORAGE_KEY =
  "trade-buddy:workspace-templates:v1";

const SUPPORTED_TEMPLATE_SCHEMA_VERSION = 1;

function makeTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `tpl-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `tpl-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function createEmptyWorkspaceTemplatesStore(): WorkspaceTemplatesStore {
  return {
    version: 1,
    activeTemplateId: null,
    templates: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadWorkspaceTemplatesStore(): WorkspaceTemplatesStore {
  if (typeof window === "undefined") {
    return createEmptyWorkspaceTemplatesStore();
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_TEMPLATES_STORAGE_KEY);
    if (!raw) return createEmptyWorkspaceTemplatesStore();
    const parsed = JSON.parse(raw);
    const validated = WorkspaceTemplatesStoreSchema.safeParse(parsed);
    if (!validated.success) {
      return createEmptyWorkspaceTemplatesStore();
    }
    return validated.data;
  } catch {
    return createEmptyWorkspaceTemplatesStore();
  }
}

export function saveWorkspaceTemplatesStore(
  store: WorkspaceTemplatesStore
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WORKSPACE_TEMPLATES_STORAGE_KEY,
      JSON.stringify(store)
    );
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export type WorkspaceTemplateSnapshotInput = Omit<
  WorkspaceTemplate,
  "id" | "name" | "schemaVersion" | "createdAt" | "updatedAt"
>;

export function buildNewWorkspaceTemplate(
  name: string,
  snapshot: WorkspaceTemplateSnapshotInput
): WorkspaceTemplate {
  const now = new Date().toISOString();
  const cleanName = name.trim().slice(0, 60) || "未命名模板";
  return WorkspaceTemplateSchema.parse({
    id: makeTemplateId(),
    name: cleanName,
    schemaVersion: 1,
    layout: snapshot.layout,
    activePaneId: snapshot.activePaneId,
    syncConfig: {
      symbol: snapshot.syncConfig.symbol,
      interval: snapshot.syncConfig.interval,
      crosshair: snapshot.syncConfig.crosshair,
    },
    panes: snapshot.panes.map((p) => ({
      paneId: p.paneId,
      initialized: p.initialized,
      symbolId: p.symbolId,
      interval: p.interval,
      chartType: p.chartType,
      activeIndicators: [...p.activeIndicators],
      drawings: p.drawings.map((d) => ({
        id: d.id,
        tool: d.tool,
        label: d.label,
        klineOverlayName: d.klineOverlayName,
        points: d.points.map((pt) => ({
          ...(typeof pt.timestamp === "number" && Number.isFinite(pt.timestamp)
            ? { timestamp: pt.timestamp }
            : {}),
          ...(typeof pt.value === "number" && Number.isFinite(pt.value)
            ? { value: pt.value }
            : {}),
        })),
        ...(d.annotationText !== undefined
          ? { annotationText: d.annotationText }
          : {}),
        ...(d.measurePricePrecision !== undefined
          ? { measurePricePrecision: d.measurePricePrecision }
          : {}),
        ...(d.measureInterval !== undefined
          ? { measureInterval: d.measureInterval }
          : {}),
        createdAt: d.createdAt,
      })),
      links: {
        symbol: p.links.symbol,
        interval: p.links.interval,
        crosshair: p.links.crosshair,
      },
    })),
    createdAt: now,
    updatedAt: now,
  });
}

export function overwriteWorkspaceTemplate(
  existing: WorkspaceTemplate,
  snapshot: WorkspaceTemplateSnapshotInput
): WorkspaceTemplate {
  const fresh = buildNewWorkspaceTemplate(existing.name, snapshot);
  return {
    ...fresh,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

export function serializeSingleTemplateExport(
  template: WorkspaceTemplate
): string {
  // Parse through schema so no unknown/sensitive fields can ever leak into exported JSON
  const sanitized = WorkspaceTemplateSchema.parse(template);
  const payload: WorkspaceTemplateExportSingle = {
    app: "trade-buddy",
    kind: "workspace_template",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    template: sanitized,
  };
  return JSON.stringify(payload, null, 2);
}

export function serializeBundleTemplatesExport(
  templates: WorkspaceTemplate[]
): string {
  const sanitized = templates.map((t) => WorkspaceTemplateSchema.parse(t));
  const payload: WorkspaceTemplateExportBundle = {
    app: "trade-buddy",
    kind: "workspace_templates",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    templates: sanitized,
  };
  return JSON.stringify(payload, null, 2);
}

export function triggerJsonDownload(filename: string, jsonText: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sanitizeFilenameSegment(name: string): string {
  return (
    name
      .trim()
      .replace(/[\\/:*?"<>|\s]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "template"
  );
}

export interface TemplateImportResult {
  ok: true;
  templates: WorkspaceTemplate[];
  warnings: string[];
}

export interface TemplateImportError {
  ok: false;
  error: string;
}

/**
 * Strictly validates imported workspace template JSON.
 * Supports:
 * 1. Trade Buddy single export (`kind: "workspace_template"`)
 * 2. Trade Buddy bundle export (`kind: "workspace_templates"`)
 * 3. Direct single template object or `{ templates: [...] }` fallback (schemaVersion <= 1)
 */
export function parseImportedTemplatesJson(
  rawText: string,
  knownSymbolIds?: Set<string>
): TemplateImportResult | TemplateImportError {
  if (!rawText || !rawText.trim()) {
    return { ok: false, error: "导入内容为空，请选择有效的 JSON 模板文件" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      error: "JSON 格式无效，无法解析文件（请确认文件未被损坏或截断）",
    };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: "模板 JSON 顶层必须是对象结构",
    };
  }

  const obj = raw as Record<string, unknown>;

  // Version compatibility check before Zod validation so user gets a clear message
  const topSchemaVersion = obj.schemaVersion ?? obj.version;
  if (
    typeof topSchemaVersion === "number" &&
    topSchemaVersion > SUPPORTED_TEMPLATE_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      error: `模板文件版本（v${topSchemaVersion}）高于当前应用支持的最高版本（v${SUPPORTED_TEMPLATE_SCHEMA_VERSION}），请更新后再导入`,
    };
  }

  let rawTemplates: WorkspaceTemplate[] | null = null;

  // 1. Standard single export
  if (obj.kind === "workspace_template") {
    const res = WorkspaceTemplateExportSingleSchema.safeParse(obj);
    if (!res.success) {
      return {
        ok: false,
        error: `单个模板结构校验失败：${formatZodFirstIssue(res.error.issues)}`,
      };
    }
    rawTemplates = [res.data.template];
  }
  // 2. Standard bundle export
  else if (obj.kind === "workspace_templates") {
    const res = WorkspaceTemplateExportBundleSchema.safeParse(obj);
    if (!res.success) {
      return {
        ok: false,
        error: `模板合集结构校验失败：${formatZodFirstIssue(res.error.issues)}`,
      };
    }
    rawTemplates = res.data.templates;
  }
  // 3. Direct template object compatibility
  else if ("layout" in obj && "panes" in obj) {
    const compatCandidate = {
      ...obj,
      id: typeof obj.id === "string" && obj.id ? obj.id : makeTemplateId(),
      schemaVersion: 1,
      createdAt:
        typeof obj.createdAt === "string"
          ? obj.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof obj.updatedAt === "string"
          ? obj.updatedAt
          : new Date().toISOString(),
    };
    const res = WorkspaceTemplateSchema.safeParse(compatCandidate);
    if (!res.success) {
      return {
        ok: false,
        error: `模板字段校验失败：${formatZodFirstIssue(res.error.issues)}`,
      };
    }
    rawTemplates = [res.data];
  }
  // 4. Plain `{ templates: [...] }` compatibility
  else if (Array.isArray(obj.templates)) {
    const parsedList: WorkspaceTemplate[] = [];
    for (let i = 0; i < obj.templates.length; i++) {
      const item = obj.templates[i];
      if (typeof item !== "object" || item === null) {
        return { ok: false, error: `第 ${i + 1} 个模板条目不是有效对象` };
      }
      const itemObj = item as Record<string, unknown>;
      if (
        typeof itemObj.schemaVersion === "number" &&
        itemObj.schemaVersion > SUPPORTED_TEMPLATE_SCHEMA_VERSION
      ) {
        return {
          ok: false,
          error: `第 ${i + 1} 个模板版本（v${itemObj.schemaVersion}）暂不支持`,
        };
      }
      const res = WorkspaceTemplateSchema.safeParse({
        ...itemObj,
        schemaVersion: 1,
      });
      if (!res.success) {
        return {
          ok: false,
          error: `第 ${i + 1} 个模板校验失败：${formatZodFirstIssue(
            res.error.issues
          )}`,
        };
      }
      parsedList.push(res.data);
    }
    if (parsedList.length === 0) {
      return { ok: false, error: "导入文件中不包含任何模板" };
    }
    rawTemplates = parsedList;
  } else {
    return {
      ok: false,
      error:
        "不是有效的 Trade Buddy 工作区模板文件（缺少 kind / layout / panes 等必要字段）",
    };
  }

  const warnings: string[] = [];
  const normalized = rawTemplates.map((tpl) => {
    const cleanPanes = tpl.panes.map((p) => {
      if (knownSymbolIds && !knownSymbolIds.has(p.symbolId)) {
        warnings.push(
          `模板「${tpl.name}」包含当前目录未收录品种 ${p.symbolId}，应用时将保留原品种或回退默认品种`
        );
      }
      return p;
    });
    return {
      ...tpl,
      id: makeTemplateId(),
      panes: cleanPanes,
      updatedAt: new Date().toISOString(),
    };
  });

  return {
    ok: true,
    templates: normalized,
    warnings,
  };
}

function formatZodFirstIssue(
  issues: Array<{ path: Array<string | number>; message: string }>
): string {
  const first = issues[0];
  if (!first) return "字段格式不符合规范";
  const pathStr = first.path.length > 0 ? first.path.join(".") : "根节点";
  return `${pathStr}：${first.message}`;
}
