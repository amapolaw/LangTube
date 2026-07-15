"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SEGMENT_MINUTE_CHOICES } from "@/lib/parse-token-policy";

export type ParseConfirmResult = {
  allowAutoSubtitles: boolean;
  segmentMinutes: number;
  offlineOnly: boolean;
};

interface ParseConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** 尚无字幕，需询问是否手传 / 自动获取 */
  awaitManualSubtitle?: boolean;
  /** 长素材，须选分段 */
  needsSegmentConfirm?: boolean;
  durationSec?: number;
  lineCount?: number;
  onConfirm: (result: ParseConfirmResult) => void;
  onUploadSubtitle?: () => void;
}

export function ParseConfirmDialog({
  open,
  onOpenChange,
  title,
  awaitManualSubtitle,
  needsSegmentConfirm,
  durationSec = 0,
  lineCount = 0,
  onConfirm,
  onUploadSubtitle,
}: ParseConfirmDialogProps) {
  const [allowAutoSubtitles, setAllowAutoSubtitles] = useState(false);
  const [segmentMinutes, setSegmentMinutes] = useState(10);
  const [offlineOnly, setOfflineOnly] = useState(true);

  const mins = durationSec > 0 ? Math.ceil(durationSec / 60) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>准备解析{title ? ` · ${title}` : ""}</DialogTitle>
          <DialogDescription>
            为节省 Token：先确认字幕来源与分段时长，再开始解析。解析内容仅为视频原声语种。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {awaitManualSubtitle && (
            <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <p>
                尚未检测到字幕。建议先上传与<strong>原声语种一致</strong>的
                SRT/VTT（不要用自动翻译成中文的字幕当原文）。
              </p>
              <div className="flex flex-wrap gap-2">
                {onUploadSubtitle && (
                  <Button type="button" size="sm" onClick={onUploadSubtitle}>
                    上传 SRT 字幕
                  </Button>
                )}
              </div>
              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={allowAutoSubtitles}
                  onChange={(e) => setAllowAutoSubtitles(e.target.checked)}
                />
                <span>我没有手写字幕，允许自动抽取/转写（更耗资源）</span>
              </label>
            </div>
          )}

          {(needsSegmentConfirm || (mins !== null && mins >= 15) || lineCount >= 200) && (
            <div>
              <Label>
                分段解析时长（分钟）
                {mins != null ? ` · 素材约 ${mins} 分钟` : ""}
                {lineCount > 0 ? ` / ${lineCount} 行` : ""}
              </Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border px-3 text-sm"
                value={segmentMinutes}
                onChange={(e) => setSegmentMinutes(Number(e.target.value))}
              >
                {SEGMENT_MINUTE_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    先解析前 {m} 分钟
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                将跳过 BGM/广告/语气词；词汇跳过基础代词冠词；句型只解析完整句并去重。
              </p>
            </div>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={offlineOnly}
              onChange={(e) => setOfflineOnly(e.target.checked)}
            />
            <span>稳妥模式（规则+词典，少用 LLM，更省 Token）</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (awaitManualSubtitle && !allowAutoSubtitles) {
                  onUploadSubtitle?.();
                  return;
                }
                onConfirm({
                  allowAutoSubtitles,
                  segmentMinutes,
                  offlineOnly,
                });
                onOpenChange(false);
              }}
            >
              {awaitManualSubtitle && !allowAutoSubtitles
                ? "去上传字幕"
                : "开始解析"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
