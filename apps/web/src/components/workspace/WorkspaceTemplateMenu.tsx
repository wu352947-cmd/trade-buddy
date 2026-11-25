"use client";

import React, { useEffect, useRef, useState } from "react";
import type {
  LayoutMode,
  WorkspaceTemplate,
} from "@trade-buddy/shared-types";
import {
  IconCheck,
  IconChevronDown,
  IconClose,
  IconDownload,
  IconEdit,
  IconPlus,
  IconTemplate,
  IconTrash,
  IconUpload,
} from "@trade-buddy/ui-tokens";

const LAYOUT_BADGE_LABELS: Record<LayoutMode, string> = {
  single: "单图",
  split_h: "左右2图",
  split_v: "上下2图",
  grid_2x2: "4宫格",
};

interface WorkspaceTemplateMenuProps {
  templates: WorkspaceTemplate[];
  activeTemplateId: string | null;
  onSaveNew: (name: string) => void;
  onApplyTemplate: (template: WorkspaceTemplate) => void;
  onOverwriteTemplate: (templateId: string) => void;
  onRenameTemplate: (templateId: string, nextName: string) => void;
  onDeleteTemplate: (templateId: string) => void;
  onExportSingle: (template: WorkspaceTemplate) => void;
  onExportAll: () => void;
  onImportJsonText: (rawText: string) => { ok: boolean; error?: string };
}

export function WorkspaceTemplateMenu({
  templates,
  activeTemplateId,
  onSaveNew,
  onApplyTemplate,
  onOverwriteTemplate,
  onRenameTemplate,
  onDeleteTemplate,
  onExportSingle,
  onExportAll,
  onImportJsonText,
}: WorkspaceTemplateMenuProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const activeTemplate =
    templates.find((t) => t.id === activeTemplateId) ?? null;

  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onSaveNew(trimmed);
    setNewName("");
    setImportError(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const res = onImportJsonText(text);
      if (!res.ok) {
        setImportError(res.error ?? "导入失败：JSON 格式或结构非法");
      } else {
        setImportError(null);
        setPasteMode(false);
      }
    } catch {
      setImportError("读取文件失败，请确认文件可读且为 UTF-8 编码 JSON");
    }
  };

  const handlePasteImport = () => {
    const res = onImportJsonText(pasteText);
    if (!res.ok) {
      setImportError(res.error ?? "导入失败：JSON 格式或结构非法");
    } else {
      setImportError(null);
      setPasteText("");
      setPasteMode(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setImportError(null);
        }}
        title="工作区模板：保存/切换布局、品种、周期、图表类型、指标、画线与联动开关，支持 JSON 导入导出"
        className={`tb-border-subtle flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
          activeTemplate
            ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
            : "tb-hover tb-text-primary"
        }`}
      >
        <IconTemplate size={14} />
        <span className="hidden md:inline max-w-[84px] truncate">
          {activeTemplate ? activeTemplate.name : "模板"}
        </span>
        {templates.length > 0 && (
          <span
            className="rounded-full px-1 text-[10px] tabular-nums"
            style={{ backgroundColor: "var(--bg-elevated)" }}
          >
            {templates.length}
          </span>
        )}
        <IconChevronDown size={12} className="opacity-75" />
      </button>

      {open && (
        <div className="tb-elevated tb-border-subtle absolute right-0 top-[34px] z-50 w-[344px] rounded-md border p-3 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[12px] font-semibold tb-text-primary">
                工作区模板（本地）
              </div>
              <div className="text-[10px] tb-text-muted">
                保存布局、品种、周期、图表、指标、画线坐标与联动开关
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tb-hover rounded p-1 tb-text-muted cursor-pointer"
            >
              <IconClose size={13} />
            </button>
          </div>

          {/* Save current workspace as new template */}
          <form onSubmit={handleSaveNew} className="flex items-center gap-1.5 mb-2.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              placeholder="输入新模板名称（如：美股日线四图）"
              className="tb-border-subtle min-w-0 flex-1 rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-muted)]"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="flex shrink-0 items-center gap-1 rounded bg-[var(--accent-primary)] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
            >
              <IconPlus size={12} />
              <span>保存</span>
            </button>
          </form>

          {/* Templates List */}
          <div className="tb-border max-h-[250px] overflow-y-auto rounded border bg-[var(--bg-canvas)] divide-y divide-[var(--border-hairline)]">
            {templates.length === 0 ? (
              <div className="px-3 py-5 text-center text-[11px] tb-text-muted">
                暂无已保存的工作区模板。输入名称点击「保存」或导入 JSON 模板。
              </div>
            ) : (
              templates.map((tpl) => {
                const isActive = tpl.id === activeTemplateId;
                const isRenaming = renamingId === tpl.id;
                const isConfirmDelete = confirmDeleteId === tpl.id;
                const drawingCount = tpl.panes.reduce(
                  (acc, p) => acc + p.drawings.length,
                  0
                );
                const symbolsSummary = tpl.panes
                  .filter((p) => p.initialized)
                  .map((p) => p.symbolId.split(":")[1] ?? p.symbolId)
                  .slice(0, 4)
                  .join(" / ");

                return (
                  <div
                    key={tpl.id}
                    className={`px-2.5 py-2 transition-colors ${
                      isActive ? "bg-[var(--accent-soft)]" : "tb-hover"
                    }`}
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          maxLength={60}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && renameText.trim()) {
                              onRenameTemplate(tpl.id, renameText);
                              setRenamingId(null);
                            } else if (e.key === "Escape") {
                              setRenamingId(null);
                            }
                          }}
                          className="tb-border-subtle min-w-0 flex-1 rounded border bg-[var(--bg-input)] px-1.5 py-0.5 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (renameText.trim()) {
                              onRenameTemplate(tpl.id, renameText);
                            }
                            setRenamingId(null);
                          }}
                          className="rounded bg-[var(--accent-primary)] px-1.5 py-0.5 text-[10px] text-white cursor-pointer"
                        >
                          <IconCheck size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="rounded px-1 py-0.5 text-[10px] tb-text-muted tb-hover cursor-pointer"
                        >
                          <IconClose size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onApplyTemplate(tpl);
                            setOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left cursor-pointer"
                          title="点击切换应用此工作区模板"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[11px] font-semibold tb-text-primary">
                              {tpl.name}
                            </span>
                            <span
                              className="shrink-0 rounded px-1 py-0.2 text-[9px] font-medium"
                              style={{
                                backgroundColor: "var(--bg-elevated)",
                                color: "var(--accent-primary)",
                              }}
                            >
                              {LAYOUT_BADGE_LABELS[tpl.layout]}
                            </span>
                            {isActive && (
                              <span className="shrink-0 text-[9px] font-semibold text-[var(--accent-primary)]">
                                当前
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] tb-text-muted">
                            {symbolsSummary || "未初始化"} · {drawingCount} 条画线
                          </div>
                        </button>

                        {/* Actions */}
                        {isConfirmDelete ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteTemplate(tpl.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded bg-[#F2485B] px-1.5 py-0.5 text-[10px] font-medium text-white cursor-pointer"
                            >
                              确认删
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded border tb-border-subtle px-1.5 py-0.5 text-[10px] tb-text-secondary cursor-pointer"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onOverwriteTemplate(tpl.id)}
                              title="用当前工作区覆盖保存此模板"
                              className="tb-hover rounded px-1.5 py-0.5 text-[10px] text-[var(--accent-primary)] cursor-pointer"
                            >
                              覆盖
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingId(tpl.id);
                                setRenameText(tpl.name);
                                setConfirmDeleteId(null);
                              }}
                              title="重命名模板"
                              className="tb-hover rounded p-1 tb-text-secondary hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <IconEdit size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onExportSingle(tpl)}
                              title="导出此模板为 JSON"
                              className="tb-hover rounded p-1 tb-text-secondary hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <IconDownload size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(tpl.id);
                                setRenamingId(null);
                              }}
                              title="删除模板"
                              className="tb-hover rounded p-1 tb-text-muted hover:text-[#F2485B] cursor-pointer"
                            >
                              <IconTrash size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Import Error Banner */}
          {importError && (
            <div
              className="mt-2 rounded border px-2 py-1.5 text-[10px] leading-snug"
              style={{
                backgroundColor: "rgba(242, 72, 91, 0.12)",
                borderColor: "rgba(242, 72, 91, 0.45)",
                color: "#F2485B",
              }}
            >
              {importError}
            </div>
          )}

          {/* Optional Paste JSON Area */}
          {pasteMode && (
            <div className="mt-2 space-y-1.5">
              <textarea
                rows={4}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="粘贴 Trade Buddy 模板 JSON 内容..."
                className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] p-1.5 font-mono text-[10px] tb-text-primary outline-none focus:border-[var(--border-focus)]"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPasteMode(false);
                    setImportError(null);
                  }}
                  className="rounded border tb-border-subtle px-2 py-0.5 text-[10px] tb-text-secondary cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handlePasteImport}
                  className="rounded bg-[var(--accent-primary)] px-2.5 py-0.5 text-[10px] font-medium text-white cursor-pointer"
                >
                  校验并导入
                </button>
              </div>
            </div>
          )}

          {/* Footer Import / Export Actions */}
          <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t tb-border pt-2">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="tb-hover tb-border-subtle flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium tb-text-primary cursor-pointer"
              >
                <IconUpload size={12} />
                <span>导入 JSON</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasteMode((v) => !v);
                  setImportError(null);
                }}
                className="tb-hover rounded px-1.5 py-1 text-[10px] tb-text-secondary cursor-pointer"
              >
                粘贴
              </button>
            </div>

            <button
              type="button"
              disabled={templates.length === 0}
              onClick={onExportAll}
              className="tb-hover tb-border-subtle flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium tb-text-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <IconDownload size={12} />
              <span>导出全部</span>
            </button>
          </div>

          <div className="mt-2 text-[10px] tb-text-muted leading-snug">
            模板仅保存在本地浏览器，导出 JSON 不包含任何 API 密钥或隐私信息。
          </div>
        </div>
      )}
    </div>
  );
}
