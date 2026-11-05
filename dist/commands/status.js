import { getScopePeer, formatRelativeTime } from '../shared/index.js';
/** /bot-status — 查看当前会话状态 */
export function statusCommand({ manager }) {
    return {
        name: 'status',
        description: '查看当前会话状态',
        handler: (cmdCtx) => {
            const { scope, peerId } = getScopePeer(cmdCtx);
            const status = manager.getStatus(scope, peerId);
            const modelInfo = status.model ? `${status.provider}/${status.model}` : '宿主默认';
            const effortInfo = status.reasoningEffort ?? '默认';
            // ★ 2026-11-04：重启后插件内存里还没有活跃记录（要等下一条消息才 resume），
            //   但 sessionId/模型偏好是持久化的 —— 别再说「当前无活跃会话」让人以为会话没了。
            if (!status.active) {
                if (!status.sessionId)
                    return '当前无活跃会话（这个 peer 还没建立过会话）';
                return [
                    '💤 会话当前不在内存（重启后要等下一条消息才会恢复）',
                    `会话: ${status.sessionId.slice(0, 8)}`,
                    `模型: ${modelInfo} · 思考: ${effortInfo}（下一条消息按这个走）`,
                    `Preset: ${status.preset ?? '无'}`,
                ].join('\n');
            }
            return [
                '📊 会话状态',
                `会话: ${status.sessionId ? status.sessionId.slice(0, 8) : '—'}`,
                `模型: ${modelInfo} · 思考: ${effortInfo}`,
                `Preset: ${status.preset ?? '无'}`,
                `消息数: ${status.messageCount ?? 0}`,
                `最后活动: ${formatRelativeTime(status.lastActivity)}`,
            ].join('\n');
        },
    };
}
//# sourceMappingURL=status.js.map