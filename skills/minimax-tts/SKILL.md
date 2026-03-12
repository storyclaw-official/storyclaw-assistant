---
name: minimax-tts
description: Text-to-speech via MiniMax T2A v2 API, optimized for Chinese Mandarin. Outputs ogg/opus format.
homepage: https://www.minimaxi.com
metadata:
  {
    "openclaw":
      {
        "emoji": "🔊",
        "requires": { "bins": ["ffmpeg"], "env": ["MINIMAX_API_KEY", "MINIMAX_GROUP_ID"] },
        "primaryEnv": "MINIMAX_API_KEY",
        "install":
          [
            {
              "id": "ffmpeg-brew",
              "kind": "brew",
              "formula": "ffmpeg",
              "bins": ["ffmpeg"],
              "label": "Install ffmpeg (brew)",
            },
          ],
      },
  }
---

# 技能：minimax-tts

> 独占技能（仅 companion/Mira 使用）
> 版本：1.0.0

---

## 功能描述

调用 MiniMax T2A v2 API 将文字合成语音，输出 ogg/opus 格式，通过 Telegram `sendVoice` 接口发送给用户。针对中文普通话深度优化，发音自然流畅，延迟低，适合 Mira 的日常陪伴场景。

---

## API 规格

| 参数         | 值                                                    |
| ------------ | ----------------------------------------------------- |
| 端点         | `https://api.minimax.chat/v1/t2a_v2`                  |
| 模型         | `speech-01-hd`（高品质）/ `speech-01`（标准，低延迟） |
| 默认声音     | `female-zhixing`（知性女声）                          |
| 输出格式     | `mp3` → ffmpeg 转码 → `ogg/opus`                      |
| 最大文本长度 | 5,000 字符                                            |
| 认证方式     | `Authorization: Bearer {MINIMAX_API_KEY}` + `GroupId` |

---

## 推荐声音选项

| Voice ID         | 中文名   | 风格       | 适用场景                        |
| ---------------- | -------- | ---------- | ------------------------------- |
| `female-zhixing` | 知性女声 | 沉稳、温暖 | 默认，Mira 日常陪伴（**推荐**） |
| `female-tianmei` | 甜美女声 | 活泼、亲切 | 轻松 morning 消息               |
| `female-shaonv`  | 少女音色 | 清新、灵动 | 活泼 discovery 分享             |
| `female-qingxin` | 清新女声 | 舒缓、柔和 | evening / weekly 情感消息       |

用户可在 `USER.md` 的 `voice_preference` 字段覆盖默认声音 ID。

---

## 调用接口

### speak(text, voice_id=None, output_path=None) → str

```
输入:
  text        必填，要合成的文字（中文优先，支持中英混合）
  voice_id    可选，覆盖 USER.md 的 voice_preference 配置
  output_path 可选，指定临时文件路径（默认 /tmp/mira_tts_{uuid}.ogg）

输出:
  str — 生成的 ogg 文件绝对路径

异常:
  MinimaxTTSError — API 调用失败（含错误码和原因）
  FFmpegNotFoundError — ffmpeg 未安装时抛出（含安装提示）
```

---

## 合成流程

```
1. 读取 USER.md voice_preference（未配置则使用 female-zhixing）
2. 构造 POST /v1/t2a_v2 请求体:
   {
     "model": "speech-01-hd",
     "text": "<消息文字>",
     "voice_setting": {
       "voice_id": "<voice_id>",
       "speed": 1.0,
       "vol": 1.0,
       "pitch": 0
     },
     "audio_setting": {
       "audio_sample_rate": 32000,
       "bitrate": 128000,
       "format": "mp3"
     },
     "GroupId": "<MINIMAX_GROUP_ID>"
   }
3. 接收 mp3 二进制流，写入 /tmp/mira_tts_{uuid}.mp3
4. 调用 ffmpeg 转码:
   ffmpeg -i /tmp/mira_tts_{uuid}.mp3 -c:a libopus -b:a 64k -ar 48000 /tmp/mira_tts_{uuid}.ogg
5. 清理临时 .mp3 文件
6. 返回 .ogg 文件路径
```

---

## 与 Telegram 集成

生成 .ogg 文件后通过 `sendVoice` 发送：

```
POST https://api.telegram.org/bot{TG_BOT_TOKEN_COMPANION}/sendVoice
Content-Type: multipart/form-data

chat_id: <TG_ADMIN_CHAT_ID>
voice:   <.ogg 文件>
caption: <原始文字>（可选，作为字幕）
```

发送后立即删除临时 .ogg 文件。

---

## 文本预处理规则

调用 API 前对消息文本做以下处理，确保朗读自然：

| 处理项        | 规则                                              |
| ------------- | ------------------------------------------------- |
| Markdown 符号 | 移除 `**`、`_`、`~`、`` ` `` 等格式符号           |
| URL           | 替换为「一个链接」                                |
| Emoji         | 保留（MiniMax 会自然跳过大多数 Emoji）            |
| 超长消息      | > 500 字时截断为前 500 字；同时发送一条完整文字版 |
| 纯数字串      | 保留（MiniMax 能正确朗读数字）                    |

---

## 语音发送时机

不是所有消息都适合语音，由 `proactive-chat` 技能根据以下规则决策：

| 触发类型     | 默认行为             | 原因                      |
| ------------ | -------------------- | ------------------------- |
| `morning`    | 语音优先             | 晨间问候适合听            |
| `evening`    | 语音优先             | 夜晚陪伴感更强            |
| `weekly`     | 语音优先             | 情感回顾适合声音传递      |
| `discovery`  | 文字优先             | 含链接/引用内容不适合朗读 |
| 用户直接对话 | 文字（除非用户要求） | 对话回复效率优先          |

用户可在 `USER.md` 的 `voice_messages` 字段全局关闭语音（`enabled: false`）。

---

## 降级策略

满足以下任一条件时，跳过语音合成，直接发送文字：

| 条件                                    | 处理                               |
| --------------------------------------- | ---------------------------------- |
| `MINIMAX_API_KEY` 未配置                | 降级，记录 warn 日志               |
| `MINIMAX_GROUP_ID` 未配置               | 降级，记录 warn 日志               |
| API 返回非 200                          | 降级，记录 error 日志              |
| ffmpeg 未安装                           | 降级，记录 warn 日志（含安装提示） |
| 文字长度 < 5 字                         | 降级（短文字不适合语音）           |
| USER.md `voice_messages.enabled: false` | 降级（用户关闭语音）               |
| discovery 消息含外链                    | 降级（链接无法朗读）               |

---

## 环境变量

| 变量               | 必填 | 说明                                       |
| ------------------ | ---- | ------------------------------------------ |
| `MINIMAX_API_KEY`  | ✅   | MiniMax 平台 API Key                       |
| `MINIMAX_GROUP_ID` | ✅   | MiniMax 账户 Group ID（控制台 → 账户信息） |
| `MINIMAX_VOICE_ID` | 可选 | 覆盖默认声音 ID（默认 `female-zhixing`）   |

---

## 依赖

- `requests`（Python HTTP 请求）
- `ffmpeg`（mp3 → ogg/opus 转码；安装：`brew install ffmpeg`）
- `MINIMAX_API_KEY`、`MINIMAX_GROUP_ID`
- `TG_BOT_TOKEN_COMPANION`、`TG_ADMIN_CHAT_ID`

---

## 日志

- 合成成功：`~/.openclaw/workspaces/companion/logs/tts.log`（记录 voice_id、字符数、耗时）
- 降级记录：同上（含降级原因）
- 错误：`~/.openclaw/workspaces/companion/logs/error.log`

---

## 与 elevenlabs-tts 对比

| 维度         | minimax-tts                 | elevenlabs-tts                   |
| ------------ | --------------------------- | -------------------------------- |
| 中文自然度   | ⭐⭐⭐⭐⭐ 极佳（原生中文） | ⭐⭐⭐⭐ 良好（multilingual v2） |
| 中英混合     | ⭐⭐⭐⭐ 良好               | ⭐⭐⭐⭐⭐ 极佳                  |
| ogg 输出     | 需 ffmpeg 转码              | 原生 ogg_opus                    |
| 声音克隆     | 不支持                      | 支持（Instant Cloning）          |
| 延迟         | ~300–600ms                  | ~600–1200ms                      |
| 成本         | 低（中文场景更划算）        | 中（Starter $5/30K 字）          |
| **推荐场景** | **纯中文、低延迟、低成本**  | **声音克隆、中英混合**           |
