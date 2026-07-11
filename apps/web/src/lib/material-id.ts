/** 反复 decode，避免路由参数已编码时再 encodeURIComponent 变成 %25xx */
export function normalizeMaterialId(raw: string): string {
  let current = raw.trim();
  for (let i = 0; i < 4; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

/** 生成媒体 API 查询串（只编码一次） */
export function mediaUrlForMaterial(materialId: string): string {
  return `/api/media?materialId=${encodeURIComponent(normalizeMaterialId(materialId))}`;
}
