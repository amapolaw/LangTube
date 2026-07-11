"use client";

import { useRef, useState } from "react";
import type { MaterialIndexEntry } from "@langtube/core";
import { Button } from "@/components/ui/button";
import { Film, FileText, Settings2 } from "lucide-react";
import Link from "next/link";
import {
  appendImportFormFields,
  formDefaultsFromIndex,
} from "@/lib/material-form";

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
        window.location.reload();
      }
    } catch {
      onUploaded?.("上传失败，请重试");
    } finally {
      setUploading(null);
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
    </div>
  );
}
