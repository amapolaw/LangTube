import { readIndex } from "@/lib/data";
import { ListenListClient } from "@/components/listen/listen-list-client";

export const dynamic = "force-dynamic";

export default async function ListenIndexPage() {
  const index = await readIndex();
  return <ListenListClient initialMaterials={index.materials} />;
}
