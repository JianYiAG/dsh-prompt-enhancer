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
  TIMEOUT_MS,
  ENHANCE_SOURCE_KIND,
  trimDraft,
  normalizeEnhancedText,
  finishError,
  resolveRoute,
  resolvePinnedRoute,
  isEnhanceable,
  isPassthrough,
  outputTokenBudget,
} from './enhance-core.js';

/**
 * Services this plugin cannot run without.
 *
 * `sessionProjections` and `agentDefaultModel` are deliberately **not** listed.
 * `resolveRoute` reads them through optional chaining and has a third fallback,
 * so the plugin works without either; listing them here would make them *hard*
 * requirements — Cordis fills every array entry into the required-service table
 * and a fiber with a missing service never activates, so the command and the
 * composer button would silently disappear on any profile that does not compose
 * `@deepseek-ai/dsh-agent-default-model` (headless, webhook-only hosts). Read
 * them at call time through `ctx.get` instead, which is what the optional chain
 * in `resolveRoute` was already written for.
 */
export const inject = ['llm', 'commands'];

/**
 * Best-effort hand-off of one auxiliary call's usage to the usage-stats meter
 * (`@jianyiagi/dsh-plugin-ui-boost`).
 *
 * The meter observes `session/event`, and `assistant/message` — the event that
 * carries usage — is produced by the agent loop. A direct `ctx.llm.stream`
 * call never enters that loop, so without this explicit report the enhancement
 * would consume tokens that no surface ever counts. The meter plugin owns the
 * hook; when it is absent this is a no-op, and metering must never affect the
 * enhancement itself.
 *
 * This report is the **only** metering channel that can work here. The meter's
 * other channel — a `globalThis.__uiBoostAux` time window, which it matches
 * against `assistant/message` timestamps — is unreachable for a direct stream
 * call because that call emits no such event; an open window could only mark
 * *someone else's* conversation as `prompt-enhance` for the five seconds after
 * the enhancement finished. The window half was therefore removed.
 */
function reportAuxUsage({ provider, model, usage }) {
  try {
    const report = globalThis.__uiBoostAuxReport;
    if (typeof report !== 'function' || usage === undefined || usage === null) return;
    report({ provider, model, usage, purpose: 'prompt-enhance', time: Date.now() });
  } catch {
    /* metering is best-effort */
  }
}

/**
 * Combine the caller's abort signal with the auxiliary-call deadline.
 *
 * `AbortSignal.any` rejects anything that is not an AbortSignal, so a caller
 * that omits `signal` (a direct command invocation, a future RPC variant)
 * would turn a missing optional into a hard failure before the model is even
 * asked. Fall back to the timeout alone in that case.
 */
function deadlineSignal(signal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal instanceof AbortSignal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * Turn a thrown stream/assembly error into user-facing text.
 *
 * The fused deadline signal cannot say which of its two inputs fired, but the
 * rejection reason can: `AbortSignal.timeout` rejects with a `TimeoutError`
 * DOMException and a caller abort with an `AbortError`. Both used to reach the
 * Chinese UI verbatim ("增强失败：The operation was aborted due to timeout"),
 * which tells the user neither what happened nor what to do. Unknown errors
 * keep their message — that text is what makes a bug report useful.
 */
function describeStreamError(error) {
  const name = error?.name;
  if (name === 'TimeoutError') {
    return `超时（${Math.round(TIMEOUT_MS / 1000)} 秒），请缩短草稿或稍后重试`;
  }
  if (name === 'AbortError') return '已取消';
  return error?.message ?? String(error);
}

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
      // Gate before the model call: a short fragment without any task signal
      // ("你我") can only be "enhanced" by fabricating a task, so it never
      // reaches the LLM. Longer task-less drafts are handled by the
      // passthrough check below (SYSTEM_PROMPT principle 8).
      if (!isEnhanceable(draft)) {
        return { kind: 'error', text: '输入过短或缺少任务描述，无法增强' };
      }
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
      let text;
      try {
        for await (const chunk of ctx.llm.stream({
          provider: route.provider,
          model: route.model,
          messages,
          system: SYSTEM_PROMPT,
          maxTokens: outputTokenBudget(draft),
          sessionId: agent.session.id,
          signal: deadlineSignal(signal),
        })) {
          assembler.push(chunk);
        }
        // Assembly belongs inside the same try: `blocks()` throws for a block
        // that started but never closed with a type it cannot assemble from
        // deltas (`image`, `file`, or a future block type). Outside the try it
        // escaped the handler, so `commands.execute` rethrew and the gateway
        // folded it into `gateway/internal`, surfacing a raw English assembler
        // message in the Chinese UI instead of this command's own error text.
        text = normalizeEnhancedText(
          assembler.blocks()
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join(''),
        );
      } catch (error) {
        return { kind: 'error', text: `增强失败：${describeStreamError(error)}` };
      } finally {
        // Report even for interrupted/failed streams: the tokens were spent.
        reportAuxUsage({ provider: route.provider, model: route.model, usage: assembler.usage });
      }
      const terminal = finishError(assembler.finish);
      if (terminal !== undefined) {
        return { kind: 'error', text: `增强中断：${terminal.message}` };
      }
      if (text === '') return { kind: 'error', text: '模型未返回增强结果' };
      // The model echoed a task-less draft instead of inventing a task for it
      // (SYSTEM_PROMPT principle 8): report "cannot enhance" and leave the
      // composer draft untouched.
      if (isPassthrough(draft, text)) {
        return { kind: 'error', text: '无法增强：原文缺少可执行的任务目标，未做改动' };
      }
      return { kind: 'success', text };
    },
  }), 'prompt-enhancer: command');
}
