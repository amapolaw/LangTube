"use client";

import { useEffect, useMemo, useState } from "react";
import {
  annotateJapaneseRuby,
  hasKanji,
  isJapaneseText,
} from "@/lib/japanese-ruby";
import { fetchFuriganaHtml } from "@/lib/furigana-cache";
import { cn } from "@/lib/utils";

export function JapaneseRubyText({
  text,
  readings,
  className,
  textClassName,
}: {
  text: string;
  /** 离线/加载中兜底；完整注音由 kuroshiro 平假名 API 提供 */
  readings?: Map<string, string> | Record<string, string>;
  className?: string;
  textClassName?: string;
}) {
  const needsRuby = Boolean(text && isJapaneseText(text) && hasKanji(text));
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!needsRuby) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    fetchFuriganaHtml(text)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [text, needsRuby]);

  const fallbackSegments = useMemo(() => {
    if (!needsRuby || !readings) return null;
    return annotateJapaneseRuby(text, readings);
  }, [text, readings, needsRuby]);

  if (!needsRuby) {
    return <span className={cn(textClassName, className)}>{text}</span>;
  }

  // kuroshiro 完整平假名
  if (html) {
    return (
      <span
        className={cn(
          "japanese-furigana inline leading-loose [&_ruby]:mx-px [&_rt]:text-[0.55em] [&_rt]:font-normal [&_rt]:tracking-wide [&_rt]:text-muted-foreground",
          textClassName,
          className
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // 加载中：词汇表 / 常用字兜底
  if (fallbackSegments) {
    return (
      <span
        className={cn("inline-flex flex-wrap items-end gap-x-0.5", className)}
      >
        {fallbackSegments.map((seg, i) =>
          seg.reading ? (
            <ruby key={i} className={cn("ruby-text", textClassName)}>
              {seg.text}
              <rp>(</rp>
              <rt className="text-[0.55em] font-normal tracking-wide text-muted-foreground">
                {seg.reading}
              </rt>
              <rp>)</rp>
            </ruby>
          ) : (
            <span key={i} className={textClassName}>
              {seg.text}
            </span>
          )
        )}
      </span>
    );
  }

  return <span className={cn(textClassName, className)}>{text}</span>;
}
