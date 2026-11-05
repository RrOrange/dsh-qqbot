# dsh-qqbot

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）接到 QQ 上的插件：群里能聊、能发图/文件、有定时任务、有多人格、有可视化设置面板。

这份是我在 [zaofan-make/dsh-qqbot](https://github.com/zaofan-make/dsh-qqbot)（又 fork 自 [tencent-connect/dsh-qqbot](https://github.com/tencent-connect/dsh-qqbot)）的 npm 发布版 1.11.36 上手工维护的版本，主要修**流式输出**和**发送链路**，并重做了设置面板的一部分 UI。逐条改动见 [CHANGELOG.md](./CHANGELOG.md)。

## 安装

前置：装好 dsh、有 QQ 机器人 AppID/AppSecret。

```powershell
git clone https://github.com/RrOrange/dsh-qqbot.git
cd dsh-qqbot
pnpm pack --pack-destination .
$tgz = (Get-ChildItem *.tgz).FullName
npx @deepseek-ai/dsh plugin --profile web add $tgz
```

打包出来的文件名不用记：它由 `package.json` 里的 `name` + `version` 决定（本项目原名 `@zaofan/dsh-qqbot`，所以叫 `zaofan-dsh-qqbot-<版本>.tgz`）。上面的 `$tgz` 直接取目录里那个 `.tgz`，改名也不影响安装。

然后重启 `dsh web`。也可以直接 `dsh plugin --profile web add github:RrOrange/dsh-qqbot`。

**没有构建步骤**：`dist/` 是随包提交的（这份 fork 没有 `src/`），`npm run build` 请忽略。

## 懒得动手？把这段话丢给 AI

不用手敲命令的话，把下面整段复制，发给你的 AI 助手（Claude Code / Cursor / dsh 自带的 agent 都行），它会把安装和验证跑完：

```text
帮我把这个 DSH 插件装好并验证：https://github.com/RrOrange/dsh-qqbot

请按下面的步骤做，每步做完告诉我结果：

1. 克隆到 ~/Documents/dsh-qqbot（已存在就先 git pull）。
2. 进目录执行：pnpm pack --pack-destination .
   注意：这个仓库的 dist/ 是随包提交的，不要执行 npm run build（它没有 src/，build 会失败）。
3. 执行：npx @deepseek-ai/dsh plugin --profile web add <第 2 步产出的 .tgz 绝对路径>
   （文件名由 package.json 的 name+version 决定，别写死；用 (Get-ChildItem *.tgz).FullName 取就行）
   Windows 上不要把带空格的目录直接 add（会报 "- isn't supported"），一定要先 pack 再 add。
4. 装完提醒我重启 `dsh web`（dist 改动需要重启才生效）。
5. 重启后帮我确认：dsh Web 的「设置」里是否出现「QQ 机器人」面板。
   如果没有，把插件的加载报错原文贴给我，不要自己猜。
6. 如果我还缺 QQ 机器人的 AppID/AppSecret，告诉我先去 https://q.qq.com 注册一个，
   并说明拿到之后在面板的哪一栏填。

遇到报错就停下来，把原始报错贴给我，不要跳过。
```

## 怎么用

- 设置面板：**设置 → QQ 机器人**（多账号时每个实例一页；必须在 `web` profile 下才有面板）
- 群里**默认只有 @ 机器人**才回复；想让它读全部群消息，要去手机 QQ 里改「机器人可获取的群聊消息范围」
- 私聊是**流式**（边生成边刷新同一条消息），群聊受平台限制只能整条发
- 斜杠命令直接发 `/help` 看

## 这份 fork 改了什么

- **流式输出真的能用了**：之前出站缓冲只在宿主早已不再发出的旧事件里创建，瞬态帧全被丢掉；改成首帧自建缓冲。新增开关「流式输出（默认开）」，私聊可关成非流式。
- **发送链路健壮性**：限流/5xx 退避重试、长消息分块单块失败不再吞掉后续、群发降速到平台配额内、审批监听重建后不再被旧实例抢走。
- **图片消息修好**：纯 `![alt](url)` 消息以前会被当纯文本发出去；上传失败也不再带 `[MEDIA:image|…]` 字面标记发出。
- **事件订阅补全**：机器人被移出群、对方关闭主动消息，现在能感知并提示。
- **设置面板**：搜索框合一（字面+语义）、保存条吸底、顶部标签吸顶、「账号与预设」页重做、删掉冗余的「怎么用 / 定时唤醒 / 扩展示例」。
- 另有一批内存泄漏、时区硬编码、定时任务漏触发之类的杂项修复。

## 目录

| 路径 | 说明 |
|---|---|
| `dist/` | **就是源码**（这份 fork 直接改编译产物，没有 `src/`） |
| `client/qqbot-settings.js` | 设置面板，单文件手写 bundle，改完刷新网页即生效 |
| `settings-host.js` | 设置页的 HTTP 路由 |
| `docs/` | 用户手册、扩展契约、架构说明 |
| `examples/` | 用户扩展（工具/命令/自定义卡片）样板 |

更多细节（配置项、内置命令、扩展开发、群管理、智能回复、架构…）：[用户手册](./docs/USER-GUIDE.md)、[完整版 README](./docs/README-full.md)。

## 参考

- DSH 插件开发文档：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/>
- QQ 开放平台：<https://bot.q.qq.com/wiki/>

## 许可

MIT，见 [LICENSE](./LICENSE)。上游版权归各自作者。
