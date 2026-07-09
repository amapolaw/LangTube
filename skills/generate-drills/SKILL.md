---
name: generate-drills
description: 从 LangTube Material 的 patterns 生成 FSI Substitution 与 Transformation Drill，写入 drills.json。
---

# generate-drills — FSI Pattern Drill 生成

## 何时使用

- Material 已有 manifest + transcript，但缺少 `drills.json`
- 说模块需要 20 轮 Substitution + 20 轮 Transformation

## 输入

- `data/materials/{materialId}/manifest.json`
- `data/materials/{materialId}/transcript.json`

## 输出

`data/materials/{materialId}/drills.json`：

```json
{
  "materialId": "...",
  "substitution": [{
    "id": "sub-1",
    "basePattern": "基础句型",
    "baseZh": "中文",
    "slots": [{ "name": "主语", "values": ["I", "You"] }],
    "rounds": [{ "prompt": "替换提示", "expected": "期望回答" }]
  }],
  "transformation": [{
    "id": "trans-1",
    "basePattern": "...",
    "transformType": "疑问句",
    "rounds": [...]
  }]
}
```

## 规则

### Substitution Drill
- 从 patterns 选 1-2 个基础句型
- 每句型 **20 轮** 替换练习
- 替换维度：主语、宾语、时态、主题词
- `prompt` 简短（3 秒内可反应）
- `expected` 为完整正确句子

### Transformation Drill
- 每句型 **20 轮** 变换
- 类型：疑问↔陈述、肯定↔否定、时态、敬语↔口语、主动↔被动

## 校验与导入

```bash
pnpm validate-pack data/materials/{materialId}
pnpm import-pack data/materials/{materialId}
```

## 参考

`data/materials/ted-ja-social-engineering-001/drills.json`
