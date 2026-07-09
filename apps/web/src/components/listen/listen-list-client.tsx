"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MaterialIndexEntry } from "@langtube/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Plus } from "lucide-react";

export function ListenListClient({
  initialMaterials,
}: {
  initialMaterials: MaterialIndexEntry[];
}) {
  const router = useRouter();
  const [materials, setMaterials] = useState(initialMaterials);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceLang, setSourceLang] = useState("ja");

  useEffect(() => {
    setMaterials(initialMaterials);
  }, [initialMaterials]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确定删除此学习资料？")) return;
    await fetch(`/api/materials/${id}`, { method: "DELETE" });
    setMaterials((m) => m.filter((x) => x.id !== id));
  }

  async function handleCreate() {
    const res = await fetch("/api/materials/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "Untitled", sourceLang }),
    });
    const data = await res.json();
    if (data.id) {
      setCreateOpen(false);
      router.push(`/listen/${data.id}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">听 — 选择学习资料</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新建学习卡片
        </Button>
      </div>

      {materials.length === 0 ? (
        <Card>
          <CardHeader className="text-center">
            <CardDescription>暂无资料</CardDescription>
            <Button className="mt-2" onClick={() => setCreateOpen(true)}>
              新建学习卡片
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {materials.map((m) => (
            <Link key={m.id} href={`/listen/${m.id}`}>
              <Card className="relative transition hover:border-primary">
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-2 top-2 h-8 w-8 text-destructive"
                  onClick={(e) => handleDelete(e, m.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <CardHeader>
                  <CardTitle>{m.title}</CardTitle>
                  <CardDescription>
                    {m.sourceLang.toUpperCase()} · {m.level} ·{" "}
                    {m.parseStatus === "ready" ? "已解析" : "待完善"}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建学习卡片</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>语言</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border px-3 text-sm"
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
              >
                <option value="ja">日语</option>
                <option value="en">英语</option>
                <option value="es">西班牙语</option>
                <option value="fr">法语</option>
              </select>
            </div>
            <Button onClick={handleCreate}>创建并进入</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
