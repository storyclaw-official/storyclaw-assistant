---
name: emotion-journal
description: Read and write emotion journal entries, maintain conversation history summaries, user profiles, and follow-up topic lists.
metadata: { "openclaw": { "emoji": "📔" } }
---

# 技能：emotion-journal

> 独占技能（仅 companion/Mira 使用）
> 版本：1.0.0

---

## 功能描述

读写用户情绪日记，维护对话历史摘要、用户画像和待跟进话题列表。
为 Mira 提供跨会话的情绪上下文，让每次对话有历史厚度。

---

## 数据存储结构

```
~/.openclaw/workspaces/companion/journal/
├── entries/
│   └── YYYYMMDD.json      # 每天一个条目文件
├── profile-notes.md       # 从对话中积累的用户背景（非系统化，自然语言）
└── pending-topics.json    # 待跟进话题队列
```

---

## 条目文件格式（entries/YYYYMMDD.json）

```json
{
  "date": "YYYY-MM-DD",
  "sessions": [
    {
      "startedAt": "ISO8601",
      "endedAt": "ISO8601",
      "emotionalTone": "neutral | positive | heavy | mixed | unknown",
      "keyTopics": ["topic1", "topic2"],
      "summary": "自然语言摘要，2-4 句话",
      "pendingFollowUp": "下次可以接上的线索（可选）",
      "userSignals": {
        "wasBusy": false,
        "sharedStruggle": false,
        "openedUp": false
      }
    }
  ],
  "dayTone": "neutral | positive | heavy | mixed | unknown"
}
```

---

## 待跟进话题格式（pending-topics.json）

```json
{
  "topics": [
    {
      "id": "uuid",
      "topic": "简短描述（一句话）",
      "addedAt": "ISO8601",
      "priority": "high | normal",
      "expiresAfter": "days",
      "source": "YYYY-MM-DD 会话摘要"
    }
  ]
}
```

---

## 操作接口

### 读操作（会话开始时调用）

**读取近期上下文：**

```
参数：
  - days: 最近 N 天（默认 3）

返回：
  {
    recentTone: "最近 N 天的整体情绪倾向",
    keyTopics: ["最近提及的关键话题（去重）"],
    pendingFollowUps: ["待跟进话题列表"],
    profileNotes: "profile-notes.md 摘要（最近更新的 3 条）"
  }
```

### 写操作（会话结束前调用）

**写入会话摘要：**

```
参数（由 Mira 在对话结束时填写）：
  - emotionalTone: string
  - keyTopics: string[]
  - summary: string（2-4 句，自然语言）
  - pendingFollowUp: string（可选）
  - userSignals: { wasBusy, sharedStruggle, openedUp }
```

**更新待跟进话题：**

```
操作：add | resolve | expire

add: 添加新的待跟进话题
  - topic: string
  - priority: "high" | "normal"
  - expiresAfter: number（天数，默认 7）

resolve: 标记话题已跟进（从队列移除）
  - id: string

expire: 手动标记过期（通常由系统定期清理，超过 expiresAfter 的自动过期）
```

**追加 profile-notes：**

```
操作：append
  - note: string（一句话，自然语言描述）
  - 最多保留 50 条，超出后移除最旧的
```

---

## 自动清理规则

- 待跟进话题：超过 `expiresAfter` 天未跟进自动移除
- 条目文件：保留最近 90 天，更旧的移至 `journal/archive/`
- profile-notes：最多 50 条，超出移除最旧的

---

## 隐私设计

- 所有数据仅写入 `~/.openclaw/workspaces/companion/journal/`
- 不向任何外部服务同步
- 不被其他智能体（Muse、Vega、Aria）读取
- 备份脚本（`scripts/backup.sh`）默认不包含 `companion/journal/`（含个人情绪数据）；使用 `--include-companion-journal` 参数可选择包含
- 卸载时，`uninstall-companion.sh` 询问是否保留 journal/ 数据

---

## 日志

- 读写操作记录：`~/.openclaw/workspaces/companion/logs/journal.log`（操作类型、时间，不含内容摘要）
