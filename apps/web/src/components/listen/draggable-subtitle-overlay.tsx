"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/utils";

type Position = { x: number; y: number };

const STORAGE_KEY = "langtube.subtitleOverlayPos";

function loadPos(storageKey: string): Position | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Position;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function savePos(storageKey: string, pos: Position) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

type Props = {
  text: string;
  /** 按素材区分记忆位置；缺省用全局 key */
  materialId?: string;
  className?: string;
};

/**
 * 视频上可拖拽的字幕叠层；松手后记住位置。
 * 默认靠底部居中；拖到容器内任意位置。
 */
export function DraggableSubtitleOverlay({
  text,
  materialId,
  className,
}: Props) {
  const storageKey = materialId
    ? `${STORAGE_KEY}.${materialId}`
    : STORAGE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const posRef = useRef<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  useEffect(() => {
    const loaded = loadPos(storageKey);
    posRef.current = loaded;
    setPos(loaded);
  }, [storageKey]);

  const clampToContainer = useCallback((next: Position): Position => {
    const container = containerRef.current;
    const box = boxRef.current;
    if (!container || !box) return next;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    return {
      x: clamp(next.x, 0, Math.max(0, cw - bw)),
      y: clamp(next.y, 0, Math.max(0, ch - bh)),
    };
  }, []);

  // 首次无记忆位置时，放到底部居中
  useEffect(() => {
    if (pos !== null) return;
    const container = containerRef.current;
    const box = boxRef.current;
    if (!container || !box) return;
    const x = (container.clientWidth - box.offsetWidth) / 2;
    const y = container.clientHeight - box.offsetHeight - 48;
    const next = clampToContainer({ x: Math.max(0, x), y: Math.max(0, y) });
    posRef.current = next;
    setPos(next);
  }, [pos, text, clampToContainer]);

  function localPoint(clientX: number, clientY: number): Position {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const box = boxRef.current;
    const current = posRef.current;
    if (!box || !current) return;
    e.preventDefault();
    e.stopPropagation();
    box.setPointerCapture(e.pointerId);
    const local = localPoint(e.clientX, e.clientY);
    dragOffset.current = {
      dx: local.x - current.x,
      dy: local.y - current.y,
    };
    setDragging(true);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const local = localPoint(e.clientX, e.clientY);
    const next = clampToContainer({
      x: local.x - dragOffset.current.dx,
      y: local.y - dragOffset.current.dy,
    });
    posRef.current = next;
    setPos(next);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const box = boxRef.current;
    box?.releasePointerCapture(e.pointerId);
    setDragging(false);
    if (posRef.current) savePos(storageKey, posRef.current);
  }

  function resetPosition() {
    localStorage.removeItem(storageKey);
    posRef.current = null;
    setPos(null);
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      <div
        ref={boxRef}
        className={cn(
          "pointer-events-auto absolute max-w-[90%] cursor-grab touch-none select-none px-1",
          dragging && "cursor-grabbing",
          className
        )}
        style={
          pos
            ? { left: pos.x, top: pos.y }
            : { left: "50%", bottom: 48, transform: "translateX(-50%)" }
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          e.preventDefault();
          resetPosition();
        }}
        title="拖拽调整字幕位置；双击复位到底部居中"
      >
        <p className="rounded bg-black/75 px-3 py-1.5 text-center text-sm leading-snug text-white shadow-md">
          {text}
        </p>
      </div>
    </div>
  );
}
