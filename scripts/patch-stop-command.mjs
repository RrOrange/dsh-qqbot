import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const file = 'C:/Users/Administrator/.dsh/profiles/desktop/local-plugins/dsh-qqbot/dist/commands/misc.js';
const src = readFileSync(file, 'utf8');
copyFileSync(file, file + '.bak-stop-20261104');

let out = src;
function cut(from, to, repl, label) {
  const i = out.indexOf(from);
  if (i === -1) throw new Error('anchor not found: ' + label);
  if (out.indexOf(from, i + 1) !== -1) throw new Error('anchor not unique: ' + label);
  const j = out.indexOf(to, i + from.length);
  if (j === -1) throw new Error('end anchor not found: ' + label);
  out = out.slice(0, i) + repl + out.slice(j + to.length);
  console.log('patched:', label);
}

// Replace the stopCommand implementation: real cancel via manager
cut(
  `/** /bot-stop — 中止当前生成（隐藏） */
export function stopCommand() {
    return {
        name: 'stop',
        description: '中止当前生成',
        hidden: true,
        handler: () => ({ kind: 'noop' }),
    };
}`,
  ``,
  `/** /stop — 中止当前会话正在生成的回合（私聊+群聊都支持） */
export function stopCommand({ manager, config } = {}) {
    return {
        name: 'stop',
        description: '停止当前正在生成的回复',
        handler: async (cmdCtx) => {
            const { scope, peerId } = getScopePeer(cmdCtx);
            const rec = manager.findByPeer(scope, peerId);
            if (rec && rec.agent && typeof rec.agent.cancel === 'function') {
                try {
                    rec.agent.cancel({ kind: 'user' });
                }
                catch { /* ignore */ }
                return '⏹ 已停止当前生成';
            }
            return '当前没有在生成的回合';
        },
    };
}`,
  'stopCommand body'
);

// Fix import: add getScopePeer
cut(
  `import { readFileSync } from 'node:fs';`,
  ``,
  `import { readFileSync } from 'node:fs';
import { getScopePeer } from '../shared/scope.js';`,
  'misc import'
);

writeFileSync(file, out);
console.log('done');
