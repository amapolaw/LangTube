---
name: parse-listening
description: 解析听力学习素材，产出 LangTube Content Pack（manifest、transcript、segments、vocabulary、patterns）。用于 TED/YouTube/B站视频批量处理。
---

# parse-listening — 听力素材解析

## 何时使用

- 用户导入 YouTube/TED/B站 URL 但 App 内解析失败（`parseStatus: pending`）
- 批量处理 15+ 篇尚雯婕式学习素材
- 需要中日/中西对照、词汇语法句型列表

## 输入

- 视频 URL 或已有字幕/文稿（SRT、VTT、txt）
- 目标语言：`en` | `ja` | `es` | `fr`
- 母语：`zh`（默认）
- 学习者水平：如 N2、B1
- 学习主题：psychology, cybersecurity, history 等

## 输出

在 `data/materials/{materialId}/` 下生成：

| 文件 | 说明 |
|------|------|
| `manifest.json` | 元数据、词汇、句型、分段摘要 |
| `transcript.json` | 逐句时间轴 + 母语对照 |
| `segments.json` | 泛听/精听推荐段 |
| `storage.json` | 存储位置（local/gdrive/baidu） |
| `drills.json` | （可选）FSI Drill 初稿 |

## 工作步骤

1. **获取字幕**：yt-dlp 拉取字幕；无字幕则 Whisper 转写
2. **逐句对齐**：每句 `{ id, start, end, text, translation }`
3. **分析分段**：
   - **泛听段**：背景介绍、语速适中、整体理解
   - **精听段**：论点密集、复杂句型、专业词汇
4. **提取词汇**：重点词 + reading + 中文 + 所属句子
5. **提取句型**：语法点 + 中日对照 + 说明
6. **校验**：`pnpm validate-pack data/materials/{id}`
7. **入库**：`pnpm import-pack data/materials/{id}`

## manifest 示例

参考：`data/materials/ted-ja-social-engineering-001/manifest.json`

## Schema

严格遵循：`schemas/content-pack.schema.json`

## 尚雯婕法要点

- 每篇标注主题领域（心理学、网络安全、历史等）
- 完整文字稿 + 逐句中日对照
- 重点词汇、语法、句型列表化
- 推荐 15 篇 TED 日语/英语/法语/西语演讲作为 starter pack

## Agent 任务包

App 导出 `data/agent-tasks/{id}.json` 时，读取该文件获取 input，完成后写入对应 material 目录。
