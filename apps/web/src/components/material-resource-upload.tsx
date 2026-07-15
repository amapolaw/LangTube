"use client";

import { useRef, useState } from "react";
import type { MaterialIndexEntry } from "@langtube/core";
import { Button } from "@/components/ui/button";
import { Film, FileText, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  appendImportFormFields,
  formDefaultsFromIndex,
} from "@/lib/material-form";
import {
  ParseConfirmDialog,
  type ParseConfirmResult,
} from "@/components/listen/parse-confirm-dialog";

type UploadKind = "video" | "subtitle";

interface MaterialResourceUploadProps {
  material: MaterialIndexEntry;
  size?: "sm" | "default";
  showSettingsLink?: boolean;
  onUploaded?: (message: string) => void;
}

export function MaterialResourceUpload({
  material,
  size = "sm",
  showSettingsLink = true,
  onUploaded,
}: MaterialResourceUploadProps) {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<UploadKind | null>(null);
  const [parseOpen, setParseOpen] = useState(false);
  const [parseHint, setParseHint] = useState<{
    awaitManualSubtitle?: boolean;
    needsSegmentConfirm?: boolean;
    durationSec?: number;
    lineCount?: number;
  }>({});

  async function handleFile(kind: UploadKind, file: File) {
    setUploading(kind);
    try {
      const defaults = formDefaultsFromIndex(material);
      const fd = new FormData();
      fd.append("sourceType", "upload");
      appendImportFormFields(fd, defaults, material.id);
      if (kind === "video") {
        fd.append("videoFile", file);
      } else {
        fd.append("subtitleFile", file);
      }

      const res = await fetch("/api/materials/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      onUploaded?.(data.message || (res.ok ? "上传成功" : "上传失败"));
      if (res.ok) {
        setParseHint({
          awaitManualSubtitle: Boolean(data.awaitManualSubtitle),
          needsSegmentConfirm: Boolean(data.needsSegmentConfirm),
          durationSec: data.durationSec,
          lineCount: data.lines,
        });
        if (kind === "video" || data.awaitManualSubtitle || data.needsSegmentConfirm) {
          setParseOpen(true);
        } else if (kind === "subtitle") {
          setParseOpen(true);
        }
      }
    } catch {
      onUploaded?.("上传失败，请重试");
    } finally {
      setUploading(null);
    }
  }

  async function startParse(result: ParseConfirmResult) {
    onUploaded?.("正在排队解析…");
    try {
      const res = await fetch(`/api/materials/${material.id}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: true,
          allowAutoSubtitles: result.allowAutoSubtitles,
          segmentMinutes: result.segmentMinutes,
          offlineOnly: result.offlineOnly,
        }),
      });
      const data = await res.json();
      onUploaded?.(data.message || "已触发解析");
      if (data.awaitManualSubtitle) {
        setParseHint({ awaitManualSubtitle: true });
        setParseOpen(true);
        return;
      }
      if (data.needsSegmentConfirm) {
        setParseHint({
          needsSegmentConfirm: true,
          durationSec: data.durationSec,
          lineCount: data.lines,
        });
        setParseOpen(true);
        return;
      }
      window.location.reload();
    } catch {
      onUploaded?.("解析请求失败");
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*,audio/*,.mp4,.mkv,.webm,.mov"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile("video", file);
          e.target.value = "";
        }}
      />
      <input
        ref={subtitleInputRef}
        type="file"
        accept=".srt,.vtt,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile("subtitle", file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        size={size}
        variant="outline"
        disabled={uploading !== null}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          videoInputRef.current?.click();
        }}
      >
        <Film className="mr-1 h-3.5 w-3.5" />
        {uploading === "video" ? "上传中…" : "视频"}
      </Button>
      <Button
        type="button"
        size={size}
        variant="outline"
        disabled={uploading !== null}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          subtitleInputRef.current?.click();
        }}
      >
        <FileText className="mr-1 h-3.5 w-3.5" />
        {uploading === "subtitle" ? "上传中…" : "字幕"}
      </Button>
      <Button
        type="button"
        size={size}
        variant="secondary"
        disabled={uploading !== null}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setParseHint({
            awaitManualSubtitle: material.parseStatus === "pending",
            needsSegmentConfirm: true,
          });
          setParseOpen(true);
        }}
      >
        <Sparkles className="mr-1 h-3.5 w-3.5" />
        准备解析
      </Button>
      {showSettingsLink && (
        <Button
          asChild
          type="button"
          size={size}
          variant="ghost"
          onClick={(e) => e.stopPropagation()}
        >
          <Link href={`/resources?materialId=${material.id}`}>
            <Settings2 className="mr-1 h-3.5 w-3.5" />
            设置
          </Link>
        </Button>
      )}

      <ParseConfirmDialog
        open={parseOpen}
        onOpenChange={setParseOpen}
        title={material.title}
        awaitManualSubtitle={parseHint.awaitManualSubtitle}
        needsSegmentConfirm={parseHint.needsSegmentConfirm}
        durationSec={parseHint.durationSec}
        lineCount={parseHint.lineCount}
        onUploadSubtitle={() => {
          setParseOpen(false);
          subtitleInputRef.current?.click();
        }}
        onConfirm={(r) => void startParse(r)}
      />
    </div>
  );
}
