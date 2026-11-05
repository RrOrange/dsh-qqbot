/**
 * /bot-restart — 通用自重启 dsh 宿主(2026-09-08, 主人定: 通用插件能力)
 *
 * 通用性: 不依赖任何硬编码路径/外部脚本 —— 动态自发现:
 *  - process.execPath = node 可执行文件; process.argv.slice(1) = 宿主启动参数(如 bin.js web);
 *  - 中间"重启助手"脚本写入系统 tmpdir(无中文路径坑), 用同一 node 解释器 detached 运行;
 *  - 助手: 延迟→杀当前宿主进程(process.kill)→等端口释放→按原命令重新 spawn 宿主(detached, unref)。
 * 跨平台(win/mac/linux), 任何机器装了本插件即可用 /bot-restart(或兼容的 /bot-exit)。
 */
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
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
            `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${process.ppid}" -ErrorAction SilentlyContinue; if ($p) { $p.Name }`,
        ], { encoding: 'utf8', timeout: 8000, windowsHide: true }).trim();
        if (!name)
            return null;
        if (!/dsh|harness|deepseek/i.test(name))
            return null;
        if (/^(node|cmd|powershell|pwsh|wscript|cscript)\.exe$/i.test(name))
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
        }
        const exe = process.execPath; // node 路径(动态)
        // 宿主启动参数(动态, 如 [bin.js, 'web'])——自重启强制带 --no-open:
        // 后台重启不再弹浏览器标签页(dsh web 启动默认开浏览器; 主人 2026-09-08 定)。
        const args = [...process.argv.slice(1)];
        if (!args.includes('--no-open'))
            args.push('--no-open');
        const pid = process.pid; // 当前宿主 PID(自己)
        const cwd = process.cwd();
        // 重启助手(独立 node 进程): 延迟 → 杀宿主 → 等 → 按原命令拉起新宿主
        const helper = [
            "const { spawn } = require('child_process');",
            `const pid = ${JSON.stringify(pid)};`,
            `const exe = ${JSON.stringify(exe)};`,
            `const args = ${JSON.stringify(args)};`,
            `const cwd = ${JSON.stringify(cwd)};`,
            'setTimeout(() => {',
            '  try { process.kill(pid, \'SIGTERM\'); } catch {}',
            `  setTimeout(() => {`,
            '    try {',
            '      const c = spawn(exe, args, { detached: true, stdio: \'ignore\', cwd });',
            '      c.unref();',
            '      try { require(\'fs\').unlinkSync(__filename); } catch {}',
            '    } catch (e) { console.error(\'[restart-helper] spawn fail\', e); }',
            `  }, ${killWaitMs});`,
            `}, ${delayMs});`,
        ].join('\n');
        const tmpFile = join(tmpdir(), `dsh-restart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.cjs`);
        writeFileSync(tmpFile, helper, 'utf8');
        // detached + unref: 重启助手脱离宿主独立存活, 宿主被杀它继续执行
        const child = spawn(exe, [tmpFile], { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
        // 宿主若被杀, 助手自己清理 tmp; 这里再兜底一个延迟删除(助手若已删则忽略)
        setTimeout(() => { try {
            rmSync(tmpFile, { force: true });
        }
        catch { /* 已删 */ } }, delayMs + killWaitMs + 8000).unref?.();
        return 'host';
    }
    catch (err) {
        console.error('[bot-restart] 触发失败: ' + (err instanceof Error ? err.message : String(err)));
        return false;
    }
}
export function botRestartCommand() {
    return {
        name: 'restart',
        description: '重启 DSH(桌面版=整窗重启不弹错误框; CLI=只重启宿主; 约10秒)',
        handler: async () => {
            const mode = selfRestart();
            if (mode === 'desktop')
                return '🔁 正在重启 DSH 桌面版(窗口会自动关掉再打开, 约 10 秒)。重启完成后我会回来报到~';
            if (mode === 'host')
                return '🔁 dsh web 即将自重启(约4秒, 期间短暂离线)。重启完成后我会回来报到~';
            return '❌ 自重启触发失败(看宿主日志)';
        },
    };
}
/** /bot-exit 旧命令兼容: 同样走自重启(杀+拉一条龙) */
export function botExitCommand() {
    return {
        name: 'exit',
        description: '(已升级) 同 /restart: 重启 DSH',
        handler: async () => {
            const mode = selfRestart();
            if (mode === 'desktop')
                return '👋 正在重启 DSH 桌面版(约 10 秒)。此命令与 /restart 同款。';
            if (mode === 'host')
                return '👋 即将自重启(约4秒)。此命令已升级为 /restart 同款(动态识别, 杀+自动拉起)。';
            return '❌ 自重启触发失败';
        },
    };
}
//# sourceMappingURL=exit.js.map