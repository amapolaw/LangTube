# LangTube

个人多语言学习交互平台 — 本地优先，可部署远端 Web / Tauri 桌面 / PWA。

## 功能

- **听**：泛听/精听分段、字幕对照、词汇句型 → Notebook
- **说**：FSI Pattern Drill（Substitution → Transformation，3 秒计时）
- **读**：影子跟读
- **写**：薄弱词主题写作
- **Notebook**：SM-2 间隔重复
- **测试**：语言能力分级
- **同步**：GitHub 元数据同步 + 网盘大文件存储
- **通勤**：离线 PDF/ePub 复习文档

## 支持语言

英语、日语、西班牙语、法语

## 快速开始

```bash
pnpm install
pnpm dev          # Web 开发服务器 http://localhost:3000
pnpm desktop:dev  # Tauri 桌面
pnpm sync         # GitHub 同步学习进度
```

## 项目结构

```
apps/web          Next.js 主应用
apps/desktop      Tauri 桌面壳
packages/core     核心类型、SRS、存储抽象
packages/cli      validate/import/sync 命令
packages/cloud-adapters  网盘适配器
skills/           Agent SKILL 文档
schemas/          Content Pack JSON Schema
data/             用户学习数据
```

## Docker 部署

```bash
docker compose -f docker/docker-compose.yml up -d
```

## Agent 工作流

使用 Cursor/Codex 等 Agent 批量解析素材：

1. 阅读 `skills/parse-listening/SKILL.md`
2. 产出符合 `schemas/content-pack.schema.json` 的 JSON
3. 运行 `pnpm validate-pack data/materials/{id}`
4. 运行 `pnpm import-pack data/materials/{id}`

## 环境变量

复制 `apps/web/.env.example` 为 `.env.local`，配置可选 LLM API Key 与网盘 OAuth。
