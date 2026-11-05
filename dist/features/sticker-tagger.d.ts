import type { Logger } from '../types.js';
/**
 * 解析设置页存下来的路由字符串 "provider|model" → { provider, model }。
 */
export declare function parseVisionModel(v: string): {
    provider: string;
    model: string;
} | null;
/** 把某条模型路由格式化成设置页下拉的 value */
export declare function formatVisionModel(provider: string, model: string): string;
/**
 * 对本地图片自动打标。visionModel 为空/找不到模型/请求失败 → null
 * (图保持"待整理", 由 agent 视觉工具补——引擎与具体插件解耦)。
 */
export declare function autoTagImage(localPath: string, visionModel: string, logger?: Logger): Promise<{
    tags: string[];
    desc: string;
} | null>;
//# sourceMappingURL=sticker-tagger.d.ts.map
