/**
 * /restart 桌面版修复（2026-11-04）
 *
 * 问题：旧 selfRestart() 只 SIGTERM 宿主(node)进程，Electron 外壳发现子进程退出
 *       → 弹「应用无法启动或已意外停止」。新宿主虽然被 detached 拉起，但外壳不认识它。
 * 修法：检测到自己跑在 DSH 桌面壳里时，改走 dsh-hot-restart 的 relaunch 机制
 *       （WMI 派发 helper → 杀整个 shell → helper 重新拉起 shell），
 *       与「热重启 DSH」按钮效果一致，不会再弹崩溃框。
 *       CLI 模式（没有 Electron 外壳）保持原行为。
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const file = 'C:/Users/Administrator/.dsh/profiles/desktop/local-plugins/dsh-qqbot/dist/commands/exit.js';
let src = readFileSync(file, 'utf8');
copyFileSync(file, file + '.bak-desktop-restart-20261104');

function replaceOnce(from, to, label) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`anchor count ${n} for ${label}`);
  src = src.replace(from, to);
  console.log('patched:', label);
}

// 1) imports
replaceOnce(
  `import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';`,
  `import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';`,
  'imports'
);

// 2) 新增：定位 dsh-hot-restart 的 restart-dsh.ps1 + 判断是否桌面壳
replaceOnce(
  `/** 触发自重启: 生成独立重启助手并脱手运行(当前宿主被杀也能继续拉起新宿主) */
export function selfRestart(delayMs = 1600, killWaitMs = 2000) {
    try {`,
  `/**
 * 找 dsh-hot-restart 自带的 restart-dsh.ps1（那是唯一被验证过的「整窗重启」路径）
 * 优先用宿主回写的 DSH_PROFILE_DIR，再从本文件向上找 6 层兜底。
 */
function findHotRestartScript() {
    const bases = [];
    const envDir = process.env.DSH_PROFILE_DIR || process.env.DSH_PROFILE_ROOT;
    if (envDir)
        bases.push(String(envDir));
    try {
        let dir = dirname(fileURLToPath(import.meta.url));
        for (let i = 0; i < 6; i++) {
            bases.push(dir);
            const up = dirname(dir);
            if (up === dir)
                break;
            dir = up;
        }
    }
    catch { /* ignore */ }
    for (const base of bases) {
        const p = join(base, 'node_modules', 'dsh-hot-restart', 'tools', 'restart-dsh.ps1');
        try {
            if (existsSync(p))
                return p;
        }
        catch { /* ignore */ }
    }
    return null;
}
/**
 * 桌面模式探测：宿主是 Electron 外壳的子进程，process.ppid 就是外壳。
 * 名字要像 DSH 外壳（harness/dsh/deepseek），且不能是 node/cmd 之类的解释器 ——
 * 否则说明是 CLI 里跑的 dsh web，杀掉 ppid 会误伤用户的终端。
 */
function detectDesktopShell() {
    if (process.platform !== 'win32' || !process.ppid)
        return null;
    try {
        const name = execFileSync('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            \`$p = Get-CimInstance Win32_Process -Filter "ProcessId=\${process.ppid}" -ErrorAction SilentlyContinue; if ($p) { $p.Name }\`,
        ], { encoding: 'utf8', timeout: 8000, windowsHide: true }).trim();
        if (!name)
            return null;
        if (!/dsh|harness|deepseek/i.test(name))
            return null;
        if (/^(node|cmd|powershell|pwsh|wscript|cscript)\\.exe$/i.test(name))
            return null;
        return { pid: process.ppid, name };
    }
    catch {
        return null;
    }
}
/** 触发自重启: 生成独立重启助手并脱手运行(当前宿主被杀也能继续拉起新宿主)
 *  返回 'desktop'(整窗重启) / 'host'(只重启宿主) / false(失败) */
export function selfRestart(delayMs = 1600, killWaitMs = 2000) {
    try {
        // 桌面壳里只杀宿主会弹「应用无法启动或已意外停止」——改走整窗重启
        const hotScript = findHotRestartScript();
        const shell = detectDesktopShell();
        if (hotScript && shell) {
            const child = spawn('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy',
                'Bypass',
                '-File',
                hotScript,
            ], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
                cwd: dirname(hotScript),
            });
            child.unref();
            console.log('[bot-restart] 桌面壳 pid=' + shell.pid + ' (' + shell.name + '), 走 ' + hotScript);
            return 'desktop';
        }`,
  'selfRestart desktop branch'
);

// 3) 旧路径 return true → 'host'
replaceOnce(
  `        return true;
    }
    catch (err) {
        console.error('[bot-restart] 触发失败: ' + (err instanceof Error ? err.message : String(err)));
        return false;
    }`,
  `        return 'host';
    }
    catch (err) {
        console.error('[bot-restart] 触发失败: ' + (err instanceof Error ? err.message : String(err)));
        return false;
    }`,
  'return host'
);

// 4) /restart 回执按模式区分
replaceOnce(
  `        handler: async () => {
            const ok = selfRestart();
            return ok
                ? '🔁 dsh web 即将自重启(约4秒, 期间短暂离线)。重启完成后我会回来报到~'
                : '❌ 自重启触发失败(看宿主日志)';
        },`,
  `        handler: async () => {
            const mode = selfRestart();
            if (mode === 'desktop')
                return '🔁 正在重启 DSH 桌面版(窗口会自动关掉再打开, 约 10 秒)。重启完成后我会回来报到~';
            if (mode === 'host')
                return '🔁 dsh web 即将自重启(约4秒, 期间短暂离线)。重启完成后我会回来报到~';
            return '❌ 自重启触发失败(看宿主日志)';
        },`,
  'restart reply'
);

// 5) /exit 回执按模式区分
replaceOnce(
  `        handler: async () => {
            const ok = selfRestart();
            return ok
                ? '👋 即将自重启(约4秒)。此命令已升级为 /restart 同款(动态识别, 杀+自动拉起)。'
                : '❌ 自重启触发失败';
        },`,
  `        handler: async () => {
            const mode = selfRestart();
            if (mode === 'desktop')
                return '👋 正在重启 DSH 桌面版(约 10 秒)。此命令与 /restart 同款。';
            if (mode === 'host')
                return '👋 即将自重启(约4秒)。此命令已升级为 /restart 同款(动态识别, 杀+自动拉起)。';
            return '❌ 自重启触发失败';
        },`,
  'exit reply'
);

writeFileSync(file, src);
console.log('done');
