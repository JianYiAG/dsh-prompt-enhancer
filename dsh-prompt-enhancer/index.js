/**
 * dsh-prompt-enhancer — host half.
 *
 * Registers the `/prompt-enhance` command: one auxiliary model call that
 * optimizes and structures the supplied draft, following the official
 * session-title-llm auxiliary-call pattern. The browser half calls it
 * through `ctx.remote.commands.execute`; the command is the only sanctioned
 * Client-to-Host operation path for a plain-JS bundle.
 */
import { createUserMessage, BlockAssembler } from '@deepseek-ai/dsh-llm';
import {
  SYSTEM_PROMPT,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_TOKENS,
  TIMEOUT_MS,
  ENHANCE_SOURCE_KIND,
  trimDraft,
  normalizeEnhancedText,
  finishError,
  resolveRoute,
  resolvePinnedRoute,
} from './enhance-core.js';

export const inject = ['llm', 'commands', 'sessionProjections', 'agentDefaultModel'];

export function apply(ctx, config) {
  // Optional pinned route from the plugin row's config: the enhancement call is
  // generation-bound, so a deployment may point it at a fast model instead of
  // the session's current one.
  const pinned = resolvePinnedRoute(config);
  ctx.effect(() => ctx.commands.register({
    name: 'prompt-enhance',
    description: '优化并结构化一段提示词文本',
    input: { hint: '<提示词>' },
    recordInput: false,
    async handler({ agent, rawInput, signal }) {
      const draft = trimDraft(rawInput);
      if (draft === '') return { kind: 'error', text: '输入为空：没有需要增强的提示词' };
      const inputBytes = Buffer.byteLength(draft, 'utf8');
      if (inputBytes > MAX_INPUT_BYTES) {
        return { kind: 'error', text: `输入过长（${inputBytes} 字节，上限 ${MAX_INPUT_BYTES} 字节）` };
      }
      const route = pinned ?? resolveRoute(ctx, agent);
      if (route === undefined) {
        return { kind: 'error', text: '无法确定增强所用模型：请先在会话中选择一个模型' };
      }
      const messages = [createUserMessage({
        content: [{ type: 'text', text: draft }],
        source: { kind: ENHANCE_SOURCE_KIND },
      })];
      const assembler = new BlockAssembler();
      try {
        for await (const chunk of ctx.llm.stream({
          provider: route.provider,
          model: route.model,
          messages,
          system: SYSTEM_PROMPT,
          maxTokens: MAX_OUTPUT_TOKENS,
          sessionId: agent.session.id,
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        })) {
          assembler.push(chunk);
        }
      } catch (error) {
        return { kind: 'error', text: `增强失败：${error?.message ?? String(error)}` };
      }
      const terminal = finishError(assembler.finish);
      if (terminal !== undefined) {
        return { kind: 'error', text: `增强中断：${terminal.message}` };
      }
      const text = normalizeEnhancedText(
        assembler.blocks()
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join(''),
      );
      if (text === '') return { kind: 'error', text: '模型未返回增强结果' };
      return { kind: 'success', text };
    },
  }), 'prompt-enhancer: command');
}
