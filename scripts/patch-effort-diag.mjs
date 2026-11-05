import { readFileSync, writeFileSync } from 'node:fs';
const p = 'C:/Users/Administrator/.dsh/profiles/desktop/local-plugins/dsh-qqbot/dist/session/session-manager.js';
let s = readFileSync(p, 'utf8');
const A1 = "        try { this.logger.info?.('[effort-diag] enter scope=' + scope + ' peerId=' + peerId + ' effort=' + JSON.stringify(effort)); } catch {}";
if (!s.includes(A1)) { console.log('A1 NOT FOUND'); process.exit(1); }
const R1 = A1 + "\n        try { (await import('node:fs')).appendFileSync('C:/Users/Administrator/.dsh/qqbot-modelsel.log', '[' + new Date().toISOString() + '] [effort-diag] enter scope=' + scope + ' peerId=' + peerId + ' effort=' + JSON.stringify(effort) + '\\n'); } catch {}";
s = s.replace(A1, R1);
const A2 = "        try { this.logger.info?.('[effort-diag] will-write route=' + JSON.stringify(route) + ' key=' + key + ' sid=' + sid); } catch {}";
if (!s.includes(A2)) { console.log('A2 NOT FOUND'); process.exit(1); }
const R2 = A2 + "\n        try { (await import('node:fs')).appendFileSync('C:/Users/Administrator/.dsh/qqbot-modelsel.log', '[' + new Date().toISOString() + '] [effort-diag] will-write key=' + key + ' sid=' + sid + ' route=' + JSON.stringify(route) + '\\n'); } catch {}";
s = s.replace(A2, R2);
const A3 = "            this.logger.info?.('[effort-diag] post-write mem-route=' + after);\n        } catch (e2)";
if (!s.includes(A3)) { console.log('A3 NOT FOUND'); process.exit(1); }
const R3 = "            this.logger.info?.('[effort-diag] post-write mem-route=' + after);\n            try { (await import('node:fs')).appendFileSync('C:/Users/Administrator/.dsh/qqbot-modelsel.log', '[' + new Date().toISOString() + '] [effort-diag] post-write mem-route=' + after + '\\n'); } catch {}\n        } catch (e2)";
s = s.replace(A3, R3);
writeFileSync(p, s);
console.log('patched file-diag OK');
