/**
 * dsh-prompt-enhancer — pure enhancement core.
 *
 * No host imports: everything here is unit-testable in plain Node. The host
 * half (index.js) wires these helpers to the command handler and the LLM
 * stream.
 */

/** Built-in enhancement instruction (not configurable). */
export const SYSTEM_PROMPT = [
  '你是提示词工程专家。请对用户给出的提示词做优化与结构化改写，让它更清晰、更完整、更容易被执行。',
  '',
  '改写原则：',
  '1. 优化表达：消除歧义和口语化说法，明确任务目标、对象、约束与期望输出。',
  '2. 忠于原文：保留原有意图、语言和信息量，不添加原文没有的事实（中文进中文出，英文进英文出）。',
  '3. 保持人类可读：一律用自然流畅的段落或短句表达，禁止使用小标题分节；读起来要像人写的需求说明。',
  '4. 简洁优先：改写结果不要明显长于原文；各部分之间不要重复表述，能合并的合并。',
  '5. 不写占位：原文没有的信息直接省略，禁止输出「未指定」「未提供」「未明确」之类的占位文字。',
  '6. 原样保留：涉及代码、命令、路径、变量名、字段名等内容时原样保留，不要改写或翻译。',
  '',
  '输出要求：只输出改写后的提示词本体，不要解释、前言、后缀，不要使用 Markdown 代码围栏或其他包装。',
].join('\n');

/** Largest draft the command accepts (bytes). */
export const MAX_INPUT_BYTES = 24576;
/** Largest enhancement result the command accepts (tokens). */
export const MAX_OUTPUT_TOKENS = 4096;
/** Auxiliary-call deadline (ms). */
export const TIMEOUT_MS = 60000;
/** Message-source kind recorded for enhancement requests. */
export const ENHANCE_SOURCE_KIND = 'prompt-enhancer';

/** Strip the leading separator whitespace `parseCommand` keeps in rawInput. */
export function trimDraft(rawInput) {
  return rawInput.replace(/^[\t\n\r ]+/, '');
}

/** Strip one whole-output Markdown code fence, if the entire output is fenced. */
export function stripFence(text) {
  const trimmed = text.trim();
  const match = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return match === null ? trimmed : match[1].trim();
}

/** Normalize raw model output into replacement draft text; `''` when unusable. */
export function normalizeEnhancedText(raw) {
  return stripFence(raw).trim();
}

/** Map a terminal finish reason to an Error, or `undefined` for a clean stop. */
export function finishError(finish) {
  switch (finish.kind) {
    case 'stop': return undefined;
    case 'error':
    case 'aborted': {
      const error = new Error(finish.failure?.message ?? finish.kind);
      return error;
    }
    case 'max-tokens': return new Error('增强结果超出长度上限');
    case 'tool-calls': return new Error('增强模型意外请求了工具');
    default: return new Error(`不支持的结束原因 "${String(finish.kind)}"`);
  }
}

/**
 * Read an optional pinned model route from the plugin row's `config`.
 *
 * The enhancement call is generation-bound: a large session model can take
 * tens of seconds, so a deployment may pin a fast model for this auxiliary
 * call regardless of the session's current model. Both fields must be
 * non-empty to take effect; otherwise the session route is used.
 * @returns `{provider, model}` for a complete pin, or `undefined`.
 */
export function resolvePinnedRoute(config) {
  const provider = config?.provider;
  const model = config?.model;
  if (typeof provider !== 'string' || provider.trim() === '') return undefined;
  if (typeof model !== 'string' || model.trim() === '') return undefined;
  return { provider: provider.trim(), model: model.trim() };
}

/**
 * Resolve the model route for the enhancement call, mirroring the Session
 * Controller's `selectionFor(agent).current` chain.
 * @returns `{provider, model}`, or `undefined` when nothing resolves.
 */
export function resolveRoute(ctx, agent) {
  const state = ctx.sessionProjections?.stateOf?.(agent.session, 'modelSelection');
  const pending = state?.pending ?? undefined;
  if (pending?.provider !== undefined && pending?.model !== undefined) {
    return { provider: pending.provider, model: pending.model };
  }
  const header = agent.session.requestHeader?.();
  if (header?.config?.provider !== undefined && header?.config?.model !== undefined) {
    return { provider: header.config.provider, model: header.config.model };
  }
  const fallback = ctx.agentDefaultModel?.currentSelection?.();
  if (fallback?.provider !== undefined && fallback?.model !== undefined) {
    return { provider: fallback.provider, model: fallback.model };
  }
  return undefined;
}
