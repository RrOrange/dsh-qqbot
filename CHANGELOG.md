# 改动记录（相对上游 zaofan-make/dsh-qqbot v1.11.36）

本仓库是 `@zaofan/dsh-qqbot` 的个人使用版本，在上游基础上做了以下修改。所有改动都只在本仓库，回退方式见每条的备份命名（本仓库已剔除 `*.bak*` 文件，历史版本请从上游 tag 取）。

## 2026-11-05

### 1. 流式输出修复（核心）

**问题**：流式代码一直在，但从未生效 —— 出站缓冲只在 durable `assistant/chunk` 事件里创建，而宿主早已不发该事件（只发瞬态 `agent/assistant-stream`），于是 `routeStreamFrame()` 永远拿不到 buffer，静默 return，正文只走 `assistant/message` 的整条发送。

**修复**：对齐官方 `tencent-connect/dsh-qqbot` 的「首帧自愈」做法 —— 收到流式首帧时若没有 buffer，就按会话现建一个（`dist/transport/outbound.js` 的 `routeStreamFrame`）；补 `StreamingWriter.reset()` / `OutboundBuffer.reset()` 支持 LLM 重试时换 attempt 重来。

**平台限制**：QQ 开放平台的流式消息接口只对 **C2C（私聊）** 开放，SDK `openStream()` 对群聊直接抛错，且必须带 `msgId`（主动消息不行）。群聊始终整条发送，这是平台行为，不是插件取舍。

### 2. 设置页新增「流式输出」开关（默认开）

`EditableConfigSchema` 增加 `streaming`（`dist/config.js`），`installLiveSettings` 把它同步进 live 配置（`dist/index.js`），设置页「回复节奏 / 出站」组里可见：开 = 私聊边生成边刷新同一条消息，关 = 非流式整条发出。保存即热更新。

### 3. 发送链路健壮性

- `dist/api/group-admin.js`：自建 REST 增加 429/5xx 退避重试（`Retry-After` 优先，否则 1s/2s/4s，最多 3 次），`msg_seq` 改为进程内严格递增，防官方 `40054005` 重复消息。
- `dist/channel-tools.js`：群发分条间隔 1.5s → 2.2s（≈27 qpm，压在未认证 30 qpm 以内）。
- `dist/transport/outbound-buffer.js`：长消息分块发送改为逐块 `try/catch`，单块失败不再丢后续所有块。
- `dist/transport/inbound.js`：`fetchImageBuffer` 超限时释放已攒下的 chunk 引用。

### 4. 图片消息链路

- `hasMarkdownSyntax` 补 `![alt](url)` 图片语法分支（原来纯图消息被当纯文本发出，图永远发不出去）。
- markdown 通道改用**重写后**的 `rawText` 发送（原来发的是原文，本地图上传改写结果被丢弃）。
- 图片上传失败时不再被同层 `catch` 吞掉降级标记（避免 `[MEDIA:image|…]` 字面出现在群里）。

### 5. 事件订阅与清理

- 新增 `GROUP_DEL_ROBOT`（机器人被移出群，群台账标记 `leftAt`）与 `GROUP_MSG_REJECT` / `C2C_MSG_REJECT`（对方关闭了主动消息）处理。
- 审批监听器在 `dispose` 时正确 `off` + 注销 dispatch，避免重建网关后旧实例抢走审批。
- `md-media-rewrite.js`：修正剥尺寸正则（`/#\s*\d+\s*px/gi`），diag 走统一日志底座。

### 6. 其它修复

- `scheduler.js`：daily 任务改为「分钟窗口」（命中后 30 分钟内补跑一次），进程卡顿跨过整分钟也不会漏。
- `chunker.js`：单行超长时硬切，避免超长行被 QQ 拒收。
- `group-join-request.js`：`pushPending` 进程内串行化，交错写入不再丢条目。
- `poll-join-requests.js`：多群同时有申请时逐群通知，不再只处理第一个群。
- `channel-tools.js`：`extSeenCtx` 改 `WeakMap` + `WeakRef` 登记簿，长跑不再泄漏。
- `outbound.js`：回合结束兜底清理 `toolCalls`。
- `bootstrap.js`：`qqApprovalDiag` 上限 200 条；`expose:'all'` 注册改为短轮询 + 30s 长跑兜底。
- `qun-login.js`：不再抢注 `SIGINT`/`SIGTERM` 并 `process.exit(0)`，退出权交还宿主。
- `middleware-setup.js`：自动撤回配置读取加 mtime 缓存（原来每条群消息都同步读盘）；禁言截止时间不再硬编码 `+08:00`。

### 7. 设置面板 UI

- 顶部标签、搜索条、保存条吸顶/吸底，长页面里始终可见。
- 「精确 / 语义」两个搜索框合并为一个（字面与语义结果 OR 合并，字面优先）。
- 「账号与预设」页重做：两段式结构、账号卡折叠、内联「添加账号」、统一弹层与配色。
- 移除「怎么用」占位卡与空的「定时唤醒」分组。
- 移除内置「🔌 扩展示例」卡片的自动铺设（需要时设 `QQBOT_SEED_EXAMPLE_UI=1`）。
- 「回复节奏 / 出站」组新增「流式输出」开关。
