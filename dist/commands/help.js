import { sendMarkdownChunked } from '../shared/index.js';
/**
 * /help —— 指令总览 + 怎么开始用。
 * 2026-11-04 主人要求：原来只注册了 /bot-help，没人知道有这个；而且光列指令名不够用，
 * 得说清「设置界面在哪 / 本群 openid 怎么拿 / 填到哪」。
 */
export function helpCommand({ config }, allCommands) {
    return {
        name: 'help',
        description: '查看所有指令以及用途',
        handler: async (cmdCtx) => {
            const lines = [
                '### QQ 机器人 · 指令总览',
                '',
                '发斜杠指令即可（群里记得先 @ 机器人）。下面每条点一下就能发。',
                '',
                '**常用**',
                '`/status` 当前会话状态 · `/presets` 有哪些人格 · `/effort` 调思考程度 · `/outmode` 切出站方式',
                '`/me` 查你的 openid / 本群 openid（配白名单、填默认管理群都用它）',
                '',
                '**全部指令**',
            ];
            for (const cmd of allCommands()) {
                const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
                const name = names[0];
                if (cmd.hidden)
                    continue;
                lines.push(`<qqbot-cmd-input text="/${name}" show="/${names.join(' / ')}"/> ${cmd.description ?? ''}`);
            }
            lines.push(
                '',
                '**怎么开始用**',
                '1. 设置界面：DSH → 设置 → QQ 机器人。账号、人格、回复节奏、表情包、定时、群管理全在那；改完点「保存」立刻生效，不用重启。',
                '2. 配群管理：在目标群里 @机器人 发 `/me`，「本群 OpenID」单独占一行，长按复制那一串，填进 设置 → 群管理 →「对话内默认管理群」。之后在 DSH 网页里对话，群工具默认就管这个群；在 QQ 群里对话则自动用当前群，不用填。',
                '3. 授权主人：同一个 `/me` 里你的 openid，填进 设置 → 群管理 →「允许操作的主人 openid」，审批/禁言这类危险操作才放行。',
                '',
                '> 指令不分大小写；机器人只回「@ 了它」的消息和私聊。',
                '> dsh-qqbot 本地版（可改 UI：设置页那个界面就是 client/qqbot-settings.js）',
            );
            await sendMarkdownChunked(cmdCtx, lines.join('\n'), config.textChunkLimit);
            return { kind: 'noop' };
        },
    };
}
//# sourceMappingURL=help.js.map
