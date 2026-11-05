/**
 * SettingsReader — settings.yaml 只读解析
 *
 * 从 ~/.dsh/settings.yaml 中读取模型配置信息。
 * 只读，不修改 settings.yaml。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import yaml from 'js-yaml';
export class SettingsReader {
    /** settings.yaml 缓存 */
    settingsCache;
    /**
     * 从 settings.yaml 的 agent-default-model 字段读取默认模型路由
     */
    readDefaultRoute() {
        const settings = this.loadSettings();
        if (!settings)
            return undefined;
        const defaultModel = settings['agent-default-model'];
        if (defaultModel?.provider && defaultModel?.model) {
            return { provider: defaultModel.provider, model: defaultModel.model };
        }
        return undefined;
    }
    /**
     * 列出 settings.yaml 中配置的所有模型
     */
    readModels() {
        const settings = this.loadSettings();
        if (!settings)
            return [];
        const models = [];
        const llmPiAi = settings['llm-pi-ai'];
        if (llmPiAi?.providers) {
            for (const [providerName, providerConfig] of Object.entries(llmPiAi.providers)) {
                if (Array.isArray(providerConfig?.models)) {
                    for (const m of providerConfig.models) {
                        if (m.id) {
                            models.push({ provider: providerName, id: m.id, name: m.name || undefined });
                        }
                    }
                }
            }
        }
        return models;
    }
    /**
     * 列出 settings.yaml 中配置的 provider 名称
     */
    readProviders() {
        const settings = this.loadSettings();
        const llmPiAi = settings?.['llm-pi-ai'];
        return llmPiAi?.providers ? Object.keys(llmPiAi.providers) : [];
    }
    /**
     * 列出「能看图」的模型(供设置页的「识图模型」下拉 + 后台自动打标使用)。
     *
     * 只收 openai-completions 类型的 provider(anthropic-messages 的请求体不是 OpenAI 格式,
     * 后台打标用不了), 且模型 input 里必须含 image。
     * 返回 [{ provider, id, name, baseURL, apiKeyEnv, api }]。
     */
    readVisionModels() {
        const settings = this.loadSettings();
        const providers = settings?.['llm-pi-ai']?.providers;
        if (!providers || typeof providers !== 'object')
            return [];
        const out = [];
        for (const [pid, pc] of Object.entries(providers)) {
            if (!pc || typeof pc !== 'object')
                continue;
            if ((pc.api || 'openai-completions') !== 'openai-completions')
                continue;
            if (!Array.isArray(pc.models))
                continue;
            for (const m of pc.models) {
                if (!m || typeof m.id !== 'string' || !m.id)
                    continue;
                const input = Array.isArray(m.input) ? m.input : [];
                if (!input.includes('image'))
                    continue;
                out.push({
                    provider: pid,
                    id: m.id,
                    name: m.name || m.id,
                    baseURL: typeof pc.baseURL === 'string' ? pc.baseURL : '',
                    apiKeyEnv: typeof pc.apiKeyEnv === 'string' ? pc.apiKeyEnv : '',
                    api: pc.api || 'openai-completions',
                });
            }
        }
        return out;
    }
    /**
     * 从 settings.yaml 的 <ns> 段读取 groupAdmin 配置。
     * 解决"QQBot 构造时 intents 一次性读取"的时序坑: settings 服务的 Web 可视化配置
     * (写 settings.yaml)是异步注入, 晚于 gateway 构造 → 启动期读文件才能在构造前拿到值。
     * 返回 undefined = settings.yaml 无该 ns 或 ns 无 groupAdmin。
     */
    readGroupAdmin(ns) {
        const settings = this.loadSettings();
        if (!settings)
            return undefined;
        const nsBlock = settings[ns];
        const ga = nsBlock?.groupAdmin;
        return ga && typeof ga === 'object' ? ga : undefined;
    }
    /**
     * 从 settings.yaml 的 <ns> 段读取群守则 groupPrompt(热更新用)。
     * fresh=true 时绕过缓存现读磁盘(每次 system prompt 渲染调用, 使 Web 改完即时生效);
     * 返回 undefined = 无该 ns / 无 groupPrompt / 空串。
     */
    readGroupPrompt(ns, fresh = false) {
        const settings = this.loadSettings(fresh);
        if (!settings)
            return undefined;
        const nsBlock = settings[ns];
        const gp = nsBlock?.groupPrompt;
        return typeof gp === 'string' && gp.trim() ? gp.trim() : undefined;
    }
    loadSettings(fresh = false) {
        if (!fresh && this.settingsCache !== undefined)
            return this.settingsCache;
        try {
            const settingsPath = resolve(homedir(), '.dsh', 'settings.yaml');
            if (!existsSync(settingsPath)) {
                this.settingsCache = null;
                return null;
            }
            const content = readFileSync(settingsPath, 'utf8');
            this.settingsCache = yaml.load(content);
            return this.settingsCache;
        }
        catch {
            this.settingsCache = null;
            return null;
        }
    }
}
//# sourceMappingURL=settings-reader.js.map