/**
 * sticker-tagger.ts — 新图后台自动打标(tags + 详细描述)
 *
 * 用设置页里选定的「识图模型」看图, 产出:
 *  - desc: 中文一句话详细描述(画面+情绪+适合场景), 供 list_stickers 返回挑选决策;
 *  - tags: 中文短标签(优先视觉输出【标签】行, 否则从描述里启发提取)。
 *
 * 模型来源: settings.yaml 的 llm-pi-ai.providers 里 input 含 image 的 openai-completions 模型;
 * 直接把图 base64 塞进 /chat/completions 请求, 不需要任何外部 CLI。
 * 没选模型/请求失败/超时 → 返回 null, 由调用方把图标记 needsDescribe(待人工整理)。
 *
 * ⚠️ 本地手改功能(fork 新增)。
 */
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { SettingsReader } from '../model/settings-reader.js';
const PROMPT = '请用简体中文回答，只输出两行，不要输出其他内容：第一行以【标签】开头，给出 3-6 个逗号分隔的中文短标签（从内容/情绪/用途三个维度）；第二行以【描述】开头，给一句中文详细描述（画面内容+情绪+适合在什么群聊场合用这张图）。';
const GENERIC = new Set(['人物', '物品', '画面', '图片', '图像', '场景', '内容', '插画', '动漫', '二次元', '背景', '角色', '风格']);
/** 单张图上限: 超过就不打了(表情包一般远小于这个) */
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 90_000;
let reader;
function settings() {
    if (!reader)
        reader = new SettingsReader();
    return reader;
}
/** 按扩展名猜 mime(data URL 用) */
function mimeOf(p) {
    const e = extname(p).toLowerCase();
    if (e === '.jpg' || e === '.jpeg')
        return 'image/jpeg';
    if (e === '.gif')
        return 'image/gif';
    if (e === '.webp')
        return 'image/webp';
    return 'image/png';
}
/**
 * 解析设置页存下来的路由字符串 "provider|model" → { provider, model }。
 * 用 '|' 而不是 '/' 分隔: 模型 id 自己就带斜杠(auto/deepseek-v4.1-flash)。
 */
export function parseVisionModel(v) {
    const s = (v ?? '').trim();
    const i = s.indexOf('|');
    if (i <= 0)
        return null;
    const provider = s.slice(0, i).trim();
    const model = s.slice(i + 1).trim();
    if (!provider || !model)
        return null;
    return { provider, model };
}
/** 把某条模型路由格式化成设置页下拉的 value */
export function formatVisionModel(provider, model) {
    return `${provider}|${model}`;
}
/**
 * 对本地图片自动打标。visionModel 为空/找不到模型/请求失败 → null
 * (图保持"待整理", 由 agent 视觉工具补——引擎与具体插件解耦)。
 */
export async function autoTagImage(localPath, visionModel, logger) {
    const route = parseVisionModel(visionModel);
    if (!route) {
        logger?.debug?.('[sticker-tagger] 未配置识图模型(sticker.visionModel 为空), 跳过自动打标');
        return null;
    }
    try {
        if (statSync(localPath).size > MAX_BYTES) {
            logger?.debug?.('[sticker-tagger] 图片超过 8MB, 跳过自动打标');
            return null;
        }
    }
    catch {
        return null;
    }
    let conf;
    try {
        conf = settings().readVisionModels().find((m) => m.provider === route.provider && m.id === route.model);
    }
    catch {
        return null;
    }
    if (!conf || !conf.baseURL) {
        logger?.debug?.(`[sticker-tagger] 设置里找不到识图模型 ${route.provider}|${route.model}(或它没有 baseURL)`);
        return null;
    }
    const base = conf.baseURL.replace(/\/+$/, '');
    const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    let b64;
    try {
        b64 = readFileSync(localPath).toString('base64');
    }
    catch {
        return null;
    }
    const apiKey = conf.apiKeyEnv ? (process.env[conf.apiKeyEnv] ?? '') : '';
    const body = {
        model: conf.id,
        messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: PROMPT },
                    { type: 'image_url', image_url: { url: `data:${mimeOf(localPath)};base64,${b64}` } },
                ],
            }],
        max_tokens: 500,
        stream: false,
    };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            body: JSON.stringify(body),
            signal: ac.signal,
        });
        if (!resp.ok) {
            logger?.debug?.(`[sticker-tagger] 识图请求失败: HTTP ${resp.status} ${url}`);
            return null;
        }
        const json = await resp.json();
        const msg = json?.choices?.[0]?.message;
        const content = Array.isArray(msg?.content)
            ? msg.content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join('\n')
            : msg?.content;
        if (typeof content !== 'string' || !content.trim())
            return null;
        const { tags, desc } = parseSummary(content);
        if (!desc && tags.length === 0)
            return null;
        return { tags, desc };
    }
    catch (err) {
        logger?.debug?.(`[sticker-tagger] 自动打标失败: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
/** 解析视觉输出: 优先【标签】/【描述】行 */
function parseSummary(summary) {
    const tags = [];
    let desc = '';
    const lines = summary.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
        if (line.startsWith('【标签】') || line.startsWith('标签:')) {
            for (const t of line.replace(/^【标签】|^标签:/, '').split(/[,，]/)) {
                const c = t.trim().replace(/^[0-9]+[.、]/, '').trim();
                if (c && !tags.includes(c))
                    tags.push(c.slice(0, 12));
            }
        }
        else if (line.startsWith('【描述】') || line.startsWith('描述:')) {
            desc = line.replace(/^【描述】|^描述:/, '').trim();
        }
        else if (!desc && line.length > desc.length) {
            desc = line; // 未按格式时整行作描述
        }
    }
    if (tags.length === 0)
        tags.push(...heuristicTags(desc));
    return { tags: tags.slice(0, 8), desc: desc.slice(0, 300) };
}
/** 模型没按格式给【标签】行时, 从描述里捞几个短词兜底 */
function heuristicTags(text) {
    const out = [];
    if (!text)
        return out;
    for (const w of text.split(/[，,。.！!？?、\s]+/)) {
        const clean = w.trim().slice(0, 12);
        if (clean && clean.length >= 2 && !GENERIC.has(clean) && !out.includes(clean))
            out.push(clean);
        if (out.length >= 5)
            break;
    }
    return out;
}
//# sourceMappingURL=sticker-tagger.js.map
