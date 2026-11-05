import { getScopePeer, sendMarkdownChunked } from '../shared/index.js';
/** 思考程度档位（对齐宿主 ReasoningEffortId: off/low/high/max） */
export const EFFORT_LEVELS = ['off', 'low', 'high', 'max'];
const LABELS = {
    off: '🚫 off · 关思考（最快）',
    low: '🌱 low · 低（快答）',
    high: '🔥 high · 高（深度）',
    max: '🧠 max · 拉满（最慢最深）',
};
/**
 * /effort —— 查看或调整思考程度（reasoningEffort）。
 * 2026-11-04 主人要求：切到 magpie 后默认带上了 max（最慢最贵），想能自己调档。
 *
 * 生效机制（session-manager.setEffortOverride）：
 *   effort 挂在会话级模型 override 的 route 上（与 /model 同一存储、同一生效链），
 *   活跃会话经 ensureModelSelection+applyModelRoute 原地热更 → 下一轮请求立即换档，
 *   不用重启会话；偏好持久化，重启后 resume 自动恢复。
 *   /effort（无参）= 显示当前档位 + 四档可点卡片；/effort clear = 恢复模型默认。
 */
export function effortCommand({ manager, config }) {
    return {
        name: 'effort',
        description: '查看或调整思考程度（用法: /effort [off|low|high|max]）',
        handler: async (cmdCtx) => {
            const { scope, peerId } = getScopePeer(cmdCtx);
            const arg = (cmdCtx.command?.raw ?? '').trim().toLowerCase();
            // ── 无参数：当前档位 + 四档卡片 ──
            if (!arg) {
                const cur = manager.getEffectiveEffort?.(scope, peerId) ?? null;
                const model = manager.getEffectiveModel?.(scope, peerId);
                const lines = [
                    '### 🧠 思考程度',
                    '',
                    `**当前档位:** ${cur ? (LABELS[cur] ?? cur) : '模型默认（未设置）'}`,
                ];
                if (model?.provider && model?.model)
                    lines.push(`**当前模型:** ${model.provider}/${model.model}`);
                lines.push(
                    '',
                    '**调整为（点击即发）:**',
                    ...EFFORT_LEVELS.map((l) => `<qqbot-cmd-input text="/effort ${l}" show="${LABELS[l]}"/>`),
                    `<qqbot-cmd-input text="/effort clear" show="↩️ clear · 恢复模型默认"/>`,
                    '',
                    'off 最快、max 最慢最深；档位**立即生效**，不用重启会话。',
                    '⚠️ 个别模型不支持 off（比如 magpie 的路由组只认 low/high/max），报错就换 low 或 clear。',
                );
                await sendMarkdownChunked(cmdCtx, lines.join('\n'), config.textChunkLimit);
                return { kind: 'noop' };
            }
            // ── 带参数：设置 ──
            const effort = arg === 'clear' || arg === 'default' || arg === '默认' ? null : arg;
            if (effort && !EFFORT_LEVELS.includes(effort)) {
                return `不认识的档位「${arg}」。可选: ${EFFORT_LEVELS.join(' / ')}（或 clear 恢复模型默认）`;
            }
            await manager.setEffortOverride(scope, peerId, effort);
            return effort
                ? `🧠 思考程度已调到 **${LABELS[effort] ?? effort}**，下一条消息生效。`
                : '🧠 思考程度已清除，恢复模型默认档。';
        },
    };
}
