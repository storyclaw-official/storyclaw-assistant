---
name: proactive-chat
description: Generate and send proactive messages based on trigger files and emotion-journal context.
metadata: { "openclaw": { "emoji": "💬" } }
---

# 技能：proactive-chat

> 独占技能（仅 companion/Mira 使用）
> 版本：1.0.0

---

## 功能描述

读取触发文件目录，结合 emotion-journal 上下文，生成具体、真实的主动消息，通过 Telegram 发送给用户，并将触发文件移入 sent/ 归档。

---

## 触发机制

### 触发文件位置

```
~/.openclaw/workspaces/companion/triggers/
```

### 触发文件格式

文件命名：`YYYYMMDD_HHMMSS_{type}.json`

```json
{
  "type": "morning | evening | discovery | weekly",
  "scheduledAt": "ISO8601",
  "context": ""
}
```

`context` 字段可选，由 cron 写入时携带额外上下文（如天气信息、日期特殊性等）。

### 处理流程

```
1. 扫描 triggers/ 目录，找到未处理的触发文件
2. 检查频率控制：
   - 同类型触发：24 小时内已发送 → 跳过，记录 skip 日志
   - 用户最近回复含 busy 信号：跳过最多 2 次连续触发
3. 调用 emotion-journal 读取：
   - 最近 3 条情绪摘要
   - 待跟进话题列表
   - 用户当前状态标签（如有）
4. 读取 USER.md 中的 quiet_hours 配置，检查当前时间是否在安静时段
5. 根据 type 和上下文生成消息（见下方"各类型生成规则"）
6. 通过 Telegram 发送给 TG_ADMIN_CHAT_ID
7. 发送成功：移动触发文件到 triggers/sent/YYYYMMDD_HHMMSS_{type}.json
8. 发送失败：30 秒后重试 1 次，仍失败则记录 error.log，不再重试
```

---

## 各类型消息生成规则

### morning（晨间）

**风格：** 轻盈，有具体内容，不说废话

**生成逻辑：**

- 优先接续 emotion-journal 中的待跟进话题（"昨天你说的那件事……"）
- 若无待跟进话题：拉取一条当日新闻或有趣事实（web-search），结合当天天气（weather），构成具体开场
- 禁止："早上好！今天有什么计划？"
- 参考："早上雨，适合发呆。昨天你说那个项目遇到了一个卡点——现在好一点了吗？"

### evening（晚间）

**风格：** 沉一点，有温度，适合回顾或缓慢展开的话题

**生成逻辑：**

- 若当天有 morning 对话记录：延续今天聊过的内容
- 若当天无对话：选择一个轻松的开放性问题，或分享一个适合夜晚想的小问题
- 参考："今天的事情都落定了？还是还有些东西在转？"

### discovery（随机分享）

**风格：** 真实的兴趣分享，不是找话题，是真的发现了什么

**生成逻辑：**

- 调用 web-search 获取最近 48 小时内的有意思内容（优先匹配用户 USER.md 中的 interests）
- 构成一个"我看到这个，想到了你"的消息结构
- 包含具体来源或核心内容摘要，不只发链接
- 参考："看到一篇关于记忆压缩的研究——说人在高压状态下对时间的感知会扭曲。感觉你最近挺忙的，有没有这种'时间过得很快但又什么都记不清'的感觉？"

### weekly（周末关怀）

**风格：** 更温暖，节奏慢，适合回顾和轻展望

**生成逻辑：**

- 回顾本周 emotion-journal 中的关键话题（1-2 个）
- 或问一个关于下周的展望性问题（不是计划，是感受）
- 参考："这周聊了不少——那个让你纠结的决定，现在心里有数了吗？"

---

## 频率控制存储

频率状态写入：`~/.openclaw/workspaces/companion/triggers/.rate-limit.json`

```json
{
  "morning": { "lastSentAt": "ISO8601", "skipCount": 0 },
  "evening": { "lastSentAt": "ISO8601", "skipCount": 0 },
  "discovery": { "lastSentAt": "ISO8601", "skipCount": 0 },
  "weekly": { "lastSentAt": "ISO8601", "skipCount": 0 }
}
```

---

## 日志

- 成功发送：`~/.openclaw/workspaces/companion/logs/proactive.log`
- 跳过记录：同上（含原因：rate_limit / quiet_hours / busy_signal）
- 错误记录：`~/.openclaw/workspaces/companion/logs/error.log`

---

## 语音发送集成

当 `minimax-tts` 或 `elevenlabs-tts` 技能已安装时，按以下规则决定发送方式：

| 触发类型    | 默认发送方式 | 说明                       |
| ----------- | ------------ | -------------------------- |
| `morning`   | 语音优先     | 晨间问候以声音传达更有温度 |
| `evening`   | 语音优先     | 夜晚陪伴声音感更强         |
| `weekly`    | 语音优先     | 情感回顾类消息适合语音     |
| `discovery` | 文字优先     | 含链接/引用，不适合朗读    |

**降级链**：TTS 技能未安装 → TTS 合成失败 → `voice_messages.enabled: false` → 全部降级为文字 `sendMessage`。
任何一步降级均不影响消息投递，只记录降级原因到 `logs/tts.log`。

---

## 依赖

- `emotion-journal` 技能（读取上下文）
- `web-search` 技能（discovery 类型）
- `weather` 技能（morning 类型，可选增强）
- `minimax-tts` 或 `elevenlabs-tts` 技能（语音发送，可选）
- 环境变量：`TG_BOT_TOKEN_COMPANION`、`TG_ADMIN_CHAT_ID`
