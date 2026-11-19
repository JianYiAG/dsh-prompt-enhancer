/**
 * dsh-prompt-enhancer — pure enhancement core.
 *
 * No host imports: everything here is unit-testable in plain Node. The host
 * half (index.js) wires these helpers to the command handler and the LLM
 * stream.
 */

/** Largest draft the command accepts (bytes). */
export const MAX_INPUT_BYTES = 24576;
/** Smallest enhancement-result budget handed to the model (tokens). */
export const MAX_OUTPUT_TOKENS = 4096;
/**
 * Largest enhancement-result budget handed to the model (tokens).
 *
 * The input cap (24 KB ≈ 8 k Chinese characters) is far above what 4096 tokens
 * can echo back at the 2× growth budget, so a long draft would always end in
 * `max-tokens` after a full generation. Raising the budget for those drafts
 * fixes that, but the raise is bounded: an unbounded value would hand the
 * provider a request it rejects outright.
 *
 * The bound is derived, not chosen: a faithful 2× rewrite of the largest
 * accepted draft needs `2 × MAX_INPUT_BYTES / 3` ≈ 16 384 tokens (3 bytes per
 * Chinese character, 1 token per character). The previous 8192 clamp covered
 * only the 1× case, so any draft past ~4 096 characters could never be echoed
 * back — the very case this ceiling exists for. `enhance-core.test.mjs` asserts
 * the 2× relation so the two constants cannot drift apart again.
 */
export const MAX_OUTPUT_TOKENS_CEILING = 16384;
/**
 * Output tokens reserved per input character when the draft is long.
 *
 * One token per Chinese character is the conservative end of the range, and a
 * faithful rewrite may reach twice the input, so 2 tokens per character covers
 * that rewrite with margin.
 */
export const OUTPUT_TOKENS_PER_INPUT_CHAR = 2;
/** Auxiliary-call deadline (ms). */
export const TIMEOUT_MS = 60000;
/** Message-source kind recorded for enhancement requests. */
export const ENHANCE_SOURCE_KIND = 'prompt-enhancer';

/**
 * Output-token budget for one draft.
 *
 * `MAX_OUTPUT_TOKENS` is a floor, never a target: shortening the budget for a
 * short draft truncates an ordinary enhancement, because a spec-style rewrite
 * of a 35-character prompt still needs well over 100 tokens. The budget is
 * raised only where a faithful 2× rewrite of a long draft could not otherwise
 * fit, and clamps at `MAX_OUTPUT_TOKENS_CEILING`.
 */
export function outputTokenBudget(draft) {
  const length = typeof draft === 'string' ? draft.length : 0;
  const worstCase = Math.ceil(length * OUTPUT_TOKENS_PER_INPUT_CHAR);
  return Math.min(MAX_OUTPUT_TOKENS_CEILING, Math.max(MAX_OUTPUT_TOKENS, worstCase));
}

/** Strip the leading separator whitespace `parseCommand` keeps in rawInput. */
export function trimDraft(rawInput) {
  if (typeof rawInput !== 'string') return '';
  return rawInput.replace(/^[\t\n\r ]+/, '');
}

/** Character budget below which a draft needs an explicit task signal. */
const MIN_ENHANCEABLE_CHARS = 4;

/**
 * High-frequency imperative verb characters of Chinese prompts. Matching is
 * char-level (no segmenter available in the zero-dependency core) and
 * deliberately permissive: a false accept costs one model call that
 * `isPassthrough` can still reject, a false reject blocks a real prompt.
 */
const TASK_VERB_WORDS = [
  '读', '写', '看', '查', '找', '改', '变', '做', '干', '跑',
  '翻译', '总结', '分析', '解释', '说明', '对比', '列举', '整理', '补充',
  '检查', '测试', '运行', '部署', '安装', '配置', '创建', '删除', '修复',
  '优化', '执行', '生成', '画', '搜索', '下载', '上传', '导出', '导入',
  '转换', '统计', '计算', '推理', '规划', '设计', '开发', '实现', '验证',
  '评估', '审核', '处理', '支持', '启用', '启动', '停止', '重启', '清理',
  '重置', '初始化', '帮助', '把', '将', '请', '按', '照', '据', '参考',
  '模仿', '改写', '润色', '扩写', '概括', '提取', '识别', '判断', '预测',
  '推荐', '模拟', '演示', '教', '告诉', '显示', '展示', '打印', '输出',
  '获取', '收集', '汇总', '兼容', '替换', '移动', '复制', '粘贴', '剪切',
  '撤销', '恢复', '同步', '异步', '发送', '接收', '请求', '响应', '渲染',
  '编译', '构建', '打包', '发布', '上线', '回滚', '归并', '合并', '拆分',
  '路由', '跳转', '封装', '抽象', '迭代', '回顾', '继续',
];
/**
 * Single-character verb entries, matched per character.
 *
 * Multi-character entries are matched whole via `TASK_VERB_WORDS`. Flattening
 * the whole list with `join('')` instead — the previous implementation — made
 * every character of "说明", "重启", "总结" a task signal in its own right, so
 * ordinary nouns passed the gate: 明天 (via 说明), 重要 (via 重启/重置), 结果
 * (via 总结), 用户 (via 启用), 行业 (via 运行/执行), 配置文件 (via 配置). 157 of
 * the 175 characters in that set existed only because a word was split. The
 * false accepts cost a full model call each, and the passthrough check only
 * catches them after the tokens are already spent.
 */
const TASK_VERB_CHARS = new Set(TASK_VERB_WORDS.filter((word) => [...word].length === 1));
/** Multi-character verb entries, matched as substrings. */
const TASK_VERB_PHRASES = TASK_VERB_WORDS.filter((word) => [...word].length > 1);

/** Separator punctuation dropped before measuring a draft's task signal. */
const TASK_SEPARATOR_RE = /[，。！？；：、,…!?;:…]/g;

/**
 * Whether a draft is worth an enhancement call.
 *
 * A draft whose task signal — the text with separators removed — is longer
 * than `MIN_ENHANCEABLE_CHARS` characters, or carries an imperative verb
 * character, is treated as a prompt. Separator punctuation is *not* a task
 * signal on its own: "嗯。" is a fragment with a full stop, not a request, so
 * it must not buy a model call that can only fabricate a task. Short
 * fragments without any signal ("你我", "你好") are rejected before the model
 * call.
 */
export function isEnhanceable(draft) {
  if (typeof draft !== 'string') return false;
  const text = draft.trim();
  if (text === '') return false;
  const signal = text.replace(/\s+/g, '').replace(TASK_SEPARATOR_RE, '');
  if (signal.length > MIN_ENHANCEABLE_CHARS) return true;
  for (const ch of signal) {
    if (TASK_VERB_CHARS.has(ch)) return true;
  }
  for (const phrase of TASK_VERB_PHRASES) {
    if (signal.includes(phrase)) return true;
  }
  return false;
}

/**
 * Punctuation, whitespace and inline decoration ignored when comparing draft
 * and echo.
 *
 * Book-title marks are deliberately *excluded*: the `verbatim` rule tells
 * the model to mark document names with 《》, so wrapping a name is a real (if
 * small) edit and must not be reported as "cannot enhance".
 *
 * The decoration set covers what a model wraps an echoed draft in when it has
 * nothing to add — em/en dashes, brackets, bullets, blockquote markers and
 * bold/italic emphasis. Omitting them (the previous set) meant "——请说明情况
 * ——" and "**请说明情况**" read as real enhancements and were written back.
 */
const PUNCT_STRIP_RE = /[\s，。！？；：、,…!?;:…「」『』“”‘’()（）【】〔〕<>·—–\-*_~`>|]/g;

/**
 * Padding an echo may carry that adds no requirement of its own.
 *
 * A model that returns the draft plus a courtesy particle ("随便" → "随便吧。")
 * still echoed it; a model that adds a real requirement did not. Anything
 * outside this set — including the book-title marks left unstripped above — is
 * a genuine edit.
 */
const PASSTHROUGH_EDGE_RE = /^[请吧呢啊呀哦嘛的了。.，,]*$/;

/**
 * Whether the model echoed the original instead of enhancing it.
 *
 * the `passthrough` rule tells the model to pass through drafts that
 * carry no task goal rather than invent one; the host treats that echo as
 * "cannot enhance" so the composer keeps the user's text.
 *
 * The verdict is decided by *what the echo adds*, not by how much longer it
 * is: everything outside the draft must be punctuation, decoration or courtesy
 * padding. A length allowance was tried before and could not tell "请随便。"
 * (no new requirement → echo) from "《报告》" (a book-title edit → not an echo),
 * because both add exactly two characters. Folding case keeps "hello" →
 * "Hello." an echo.
 *
 * @param draft - the text the user submitted.
 * @param output - the model's returned text, already normalized.
 */
export function isPassthrough(draft, output) {
  if (typeof draft !== 'string' || typeof output !== 'string') return false;
  const strip = (s) => s.replace(PUNCT_STRIP_RE, '').toLowerCase();
  const source = strip(draft);
  if (source === '') return false;
  const result = strip(output);
  const at = result.indexOf(source);
  if (at === -1) return false;
  // Strip the echoed draft out and inspect the remainder: it may only be
  // padding, never added content.
  const remainder = result.slice(0, at) + result.slice(at + source.length);
  return PASSTHROUGH_EDGE_RE.test(remainder);
}

/**
 * Phrases that point at content from an earlier turn instead of stating it.
 *
 * The enhancement call is a **single-shot auxiliary call**: it sends the system
 * instruction plus the draft, and no conversation history, so a draft whose
 * task object is only a reference ("按照你的建议去执行修改") reaches the model
 * with nothing to bind the reference to. The `passthrough` rule used to treat that as
 * "no task goal" and echo the draft, which the host then reported as "原文缺少
 * 可执行的任务目标" — a wrong diagnosis, because the draft does have an action
 * (执行修改); what it lacks is the referent.
 *
 * This list exists only to **name that failure accurately** when the model
 * still echoes. It is not a gate and never blocks a call: closing the list
 * would misreport the long tail as "no task goal" again, which is exactly the
 * misleading message this replaced.
 */
const DEICTIC_PHRASES = [
  // Possessive reference to what the assistant said.
  '你的建议', '你的方案', '你的思路', '你的意见', '你的想法', '你的回复', '你的分析', '你的结论',
  '您的建议', '您的方案', '您的思路', '您的意见', '您的想法',
  '你刚才', '你之前', '你上面', '你此前', '你说的', '你提的', '你给的', '你推荐的', '你列出的',
  '你上一条', '你上轮', '你上一轮',
  // Demonstrative reference to an earlier artifact.
  '上面的建议', '上面的方案', '上面的思路', '上面的意见', '上面的分析', '上面的结论',
  '上述建议', '上述方案', '上述思路', '上述意见', '上述分析', '上述结论',
  '刚才说', '刚才提', '刚才讲', '前面说', '前面提', '前面讲', '此前说', '此前提',
  '上一条', '上一条回复', '上一轮', '上轮', '上一版',
  // Reference to a plan or prior agreement.
  '按计划', '按原计划', '照计划', '按既定方案', '按这个方案', '按那个方案', '按该方案',
  '照你说的', '照你上面', '照旧', '如上所述', '按上述',
];

/**
 * Whether a draft refers to an earlier turn instead of naming its object.
 *
 * Used only to pick the error message after the model echoed the draft, so a
 * false positive costs a slightly wrong sentence, never a blocked call or a
 * modified draft. Latin drafts are matched on their own short list because the
 * same failure shows up as "do what you suggested".
 */
const DEICTIC_EN_RE = /\b(your (?:suggestion|plan|idea|advice|proposal|approach|recommendation)|what you (?:said|suggested|mentioned|proposed)|the (?:plan|suggestion|approach) above|as discussed|as you suggested|previous (?:reply|response|message)|\bthe above (?:plan|suggestion))\b/i;

export function hasDeicticReference(draft) {
  if (typeof draft !== 'string') return false;
  if (DEICTIC_EN_RE.test(draft)) return true;
  return DEICTIC_PHRASES.some((phrase) => draft.includes(phrase));
}

/**
 * A block-level fenced span anywhere in the text (fence on its own line).
 *
 * Inline spans ("文本里有 ```行内``` 片段") deliberately do not match: they are
 * content, not packaging. `\r?\n` accepts CRLF output: a model answering over a
 * CRLF-safe channel would otherwise leave the whole fence in the draft.
 */
const BLOCK_FENCE_RE = /(?:^|\r?\n)[ \t]*```[^\n]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?=\r?\n|$)/;

/**
 * Meta-commentary a model may prepend to its answer.
 *
 * The opener is a **closed phrase list**, not an "any sentence starting with
 * 这是/如下" pattern: the previous `[^\n]{0,60}?` form treated any such line as
 * packaging and silently deleted real first lines ("这是第一步：", "下面是需要
 * 你执行的任务：", "Here is the plan:"). Only an opener that announces *the
 * answer itself* is stripped, and only when it is followed by a newline.
 */
const PREAMBLE_RE = new RegExp(
  '^(?:'
  + '以下(?:是|为)(?:改写|优化|增强)(?:后|过)?的?(?:结果|提示词|版本|内容)?'
  + '|下面是(?:改写|优化|增强)(?:后|过)?的?(?:结果|提示词|版本|内容)'
  + '|这是(?:改写|优化|增强)(?:后|过)?的?(?:结果|提示词|版本|内容)'
  + "|here(?:'s| is) (?:the |your )?(?:enhanced|rewritten|optimized|improved) (?:prompt|version|text|result)"
  + "|the (?:enhanced|rewritten) (?:prompt|version)"
  + ')[^\\n]{0,40}?[:：]\\s*\\r?\\n',
  'i',
);

/**
 * Meta-commentary a model may *append* after its answer ("希望有帮助").
 *
 * Only stripped from the tail of a fenced block extraction, where the fence
 * itself already proves where the answer ended; never from an unfenced draft,
 * because a legitimate closing sentence is content.
 */
const TRAILING_REMARK_RE = new RegExp(
  '^\\s*(?:'
  + '希望(?:这|以上)?(?:对你有帮助|有帮助|能帮到你)'
  + '|以上(?:就)?是(?:改写|优化|增强)(?:后|过)?的?(?:结果|提示词|版本|内容)[。.]?'
  + '|(?:hope (?:this|that) helps|let me know if)'
  + ')[\\s\\S]*$',
  'i',
);

/**
 * Whether `text` is only meta-commentary (safe to drop around a fence).
 *
 * This closed-list check — not a length ratio — is what protects a markdown
 * draft from being truncated: a faithful rewrite of such a draft carries real
 * instructions outside its first fence, so it fails this predicate and the
 * whole text is returned untouched. A ratio guard was tried first and rejected:
 * it refuses legitimate packaging on short answers, where the commentary itself
 * is more than half the output.
 */
function isMetaCommentary(text) {
  const body = text.trim();
  if (body === '') return true;
  // One short line that is itself an opener or a closing remark.
  if (body.length > 80) return false;
  if (body.includes('\n')) return false;
  return PREAMBLE_RE.test(body + '\n') || TRAILING_REMARK_RE.test(body);
}

/**
 * Strip one whole-output Markdown code fence when the *entire* output is fenced,
 * or the first block fence when the model wrapped its answer in commentary.
 *
 * Models commonly answer "here is the result:" + a fence, or a fence plus a
 * closing remark. Leaving that packaging in place writes the preamble and the
 * backticks straight into the composer.
 *
 * The block-fence branch is deliberately conservative: it fires only when
 * everything outside the fence is meta-commentary. A draft that is itself
 * markdown therefore survives, packaging and all, instead of being truncated
 * to the contents of its first code block.
 */
export function stripFence(text) {
  if (typeof text !== 'string') return '';
  const trimmed = text.trim();
  const whole = /^```[^\n]*\r?\n([\s\S]*?)\r?\n?```$/.exec(trimmed);
  if (whole !== null) {
    const inner = whole[1].trim();
    // A whole-text fence is unambiguous packaging; only strip the trailing
    // remark that the fence itself already separated from the answer.
    return inner.replace(TRAILING_REMARK_RE, '').trim();
  }
  const block = BLOCK_FENCE_RE.exec(trimmed);
  if (block === null) return trimmed;
  const [, body] = block;
  const outsideBefore = trimmed.slice(0, block.index);
  const outsideAfter = trimmed.slice(block.index + block[0].length);
  if (!isMetaCommentary(outsideBefore) || !isMetaCommentary(outsideAfter)) return trimmed;
  return body.trim();
}

/** Drop a leading meta-commentary line ("以下是改写结果：" etc.), if present. */
function stripPreamble(text) {
  return text.replace(PREAMBLE_RE, '');
}

/** A Markdown heading line (`## 任务`), not a `#` inside a code block's prose. */
export function hasHeading(text) {
  return typeof text === 'string' && /^#{1,6}[ \t]+\S/m.test(text);
}

/** Whether the text carries a block-level fenced span. */
export function hasBlockFence(text) {
  return typeof text === 'string' && BLOCK_FENCE_RE.test(text);
}

/**
 * Placeholder tokens the draft expects to survive verbatim.
 *
 * Bracket placeholders (`[模块]`, `[可观察的结果]`) and template variables
 * (`{{name}}`) are the two shapes the framework template and ordinary prompts
 * use. Markdown link text (`[docs](url)`) is excluded: the bracket there is
 * syntax, and rewriting the link label is normal editing.
 */
const PLACEHOLDER_RE = /\[[^\[\]\n()]{1,40}\](?!\()|\{\{[^{}\n]{1,40}\}\}/g;

export function extractPlaceholders(text) {
  if (typeof text !== 'string') return [];
  return [...new Set(text.match(PLACEHOLDER_RE) ?? [])];
}

/**
 * Structural diff between draft and rewrite: what was kept, dropped or added.
 *
 * Used by the offline checker and the scorer. It reports rather than throws, so
 * a legitimate rewrite that reflows headings does not have to be a violation.
 */
export function diffStructure(input, output) {
  const inText = typeof input === 'string' ? input : '';
  const outText = typeof output === 'string' ? output : '';
  const inVars = extractPlaceholders(inText);
  const outVars = extractPlaceholders(outText);
  return {
    fences: { kept: hasBlockFence(inText) && hasBlockFence(outText), added: !hasBlockFence(inText) && hasBlockFence(outText), lost: hasBlockFence(inText) && !hasBlockFence(outText) },
    headings: { kept: hasHeading(inText) && hasHeading(outText), added: !hasHeading(inText) && hasHeading(outText), lost: hasHeading(inText) && !hasHeading(outText) },
    variables: {
      kept: inVars.filter((token) => outVars.includes(token)),
      dropped: inVars.filter((token) => !outVars.includes(token)),
      added: outVars.filter((token) => !inVars.includes(token)),
    },
  };
}

/**
 * Normalize raw model output into replacement draft text; `''` when unusable.
 *
 * `options.input` is the draft the answer rewrites. When the draft itself
 * carries a fenced block or heading, packaging is part of the content: the
 * answer keeps its fence instead of being unwrapped (a code-block prompt would
 * otherwise be written back without its delimiters, or truncated to its first
 * block). With no input, or an input without structure, the old unwrapping
 * behaviour applies unchanged.
 */
export function normalizeEnhancedText(raw, options = {}) {
  if (typeof raw !== 'string') return '';
  const input = options.input;
  if (typeof input === 'string' && (hasBlockFence(input) || hasHeading(input))) {
    return stripPreamble(raw.trim()).trim();
  }
  return stripPreamble(stripFence(raw)).trim();
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
 * Controller's `selectionFor(agent).current` chain: the pending projection
 * selection, then the logged request header, then the host default model.
 *
 * Both optional services are read through `ctx.get` (or a plain property, for
 * test stubs) rather than declared in `inject`: they are fallbacks, and
 * declaring them would stop the plugin from loading on hosts that do not
 * compose them. Every access is guarded, so a missing service just falls
 * through to the next link — which is exactly why `inject` must not list them.
 *
 * @param ctx - host context (`ctx.get` present in production, absent in tests).
 * @param agent - the agent the command runs for.
 * @returns `{provider, model}`, or `undefined` when nothing resolves.
 */
export function resolveRoute(ctx, agent) {
  const service = (name) => (typeof ctx?.get === 'function' ? ctx.get(name) : ctx?.[name]);
  const state = service('sessionProjections')?.stateOf?.(agent.session, 'modelSelection');
  const pending = state?.pending ?? undefined;
  if (pending?.provider !== undefined && pending?.model !== undefined) {
    return { provider: pending.provider, model: pending.model };
  }
  const header = agent.session.requestHeader?.();
  if (header?.config?.provider !== undefined && header?.config?.model !== undefined) {
    return { provider: header.config.provider, model: header.config.model };
  }
  const fallback = service('agentDefaultModel')?.currentSelection?.();
  if (fallback?.provider !== undefined && fallback?.model !== undefined) {
    return { provider: fallback.provider, model: fallback.model };
  }
  return undefined;
}

/** Placeholder phrases the instruction forbids in the output. */
export const PLACEHOLDER_WORDS = ['未指定', '未提供', '未明确', '待补充', 'TODO', 'TBD'];

/**
 * Length ceiling for one draft.
 *
 * Chinese-led drafts are measured in characters (`2x + 80`, floored at 220);
 * Latin-led drafts are measured in words (`2w + 30`, floored at 80), because a
 * character ratio punishes English by roughly four times. The floor is a safety
 * net, not a target: observed outputs sit near 124 characters / 50 words.
 */
export const BUDGET_MIN_CHARS = 220;
export const BUDGET_MIN_WORDS = 80;

/** Whitespace-free text, the measurement unit for the character budget. */
export function compactText(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, '') : '';
}

/** Latin words, used as the unit for Latin-led drafts. */
export function countLatinWords(text) {
  return typeof text === 'string' ? (text.match(/[A-Za-z][A-Za-z0-9_'.-]*/g) ?? []).length : 0;
}

/**
 * Budget for one draft: characters for Chinese-led, words for Latin-led.
 *
 * `input` is the measured size of the draft in the same unit, so callers can
 * report the baseline alongside the ceiling.
 */
export function budgetFor(draft) {
  const text = typeof draft === 'string' ? draft : '';
  if (isChineseText(text)) {
    const length = compactText(text).length;
    return { kind: 'chars', input: length, limit: Math.max(length * 2 + 80, BUDGET_MIN_CHARS) };
  }
  const words = countLatinWords(text);
  return { kind: 'words', input: words, limit: Math.max(words * 2 + 30, BUDGET_MIN_WORDS) };
}

export function exceedsBudget(draft, output) {
  const budget = budgetFor(draft);
  if (budget.kind === 'chars') return compactText(output).length > budget.limit;
  return countLatinWords(output) > budget.limit;
}

/** The sentence injected into the system prompt for this draft. */
export function budgetInstruction(draft) {
  const budget = budgetFor(draft);
  return budget.kind === 'chars'
    ? `不超过 ${budget.limit} 字`
    : `不超过 ${budget.limit} 个英文单词`;
}

/**
 * Literals that must survive enhancement verbatim: Windows paths, posix-ish
 * paths, and backtick code spans (inner text only — dropping the backtick
 * markers themselves is fine).
 */
function extractLiterals(input) {
  const literals = [];
  for (const match of input.matchAll(/[A-Za-z]:\\[^\s，。；、！？》」』）)"']+/g)) literals.push(match[0]);
  for (const match of input.matchAll(/`([^`\n]+)`/g)) literals.push(match[1]);
  for (const match of input.matchAll(/(?:^|[\s（(])((?:[\w.-]+\/)+[\w.-]+)/g)) literals.push(match[1]);
  return literals;
}

/**
 * Project-specific tokens a spec-style rewrite must not invent.
 *
 * The `derivable` rule permits generic dimensions but forbids project facts. The only
 * mechanically detectable shape of those facts in a prompt is a concrete
 * token: an absolute path, a code span, or a dotted identifier. A derived
 * dimension ("边界情况") never looks like one, so anything here that is absent
 * from the draft was made up.
 *
 * Tokens containing CJK are skipped: a path that runs into Chinese text
 * ("D:\project\框架-v2") has no mechanical end, so comparing it would report
 * faithful rewrites as fabricated.
 */
const CJK_RE = /[\u4e00-\u9fff]/;

function extractProjectTokens(text) {
  const tokens = new Set();
  for (const match of text.matchAll(/[A-Za-z]:\\[^\s，。；、！？》」』）)"']+/g)) tokens.add(match[0]);
  for (const match of text.matchAll(/`([^`\n]+)`/g)) tokens.add(match[1]);
  for (const match of text.matchAll(/\b[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\b/g)) tokens.add(match[0]);
  // A code span and the dotted-identifier rule can both match the same token;
  // keep the longest so one invention is reported once.
  return [...tokens]
    .filter((token) => !CJK_RE.test(token))
    .filter((token, _, all) => !all.some((other) => other !== token && other.includes(token)));
}

/**
 * Share of CJK characters above which a text counts as Chinese-led.
 *
 * The language rule only exists to catch a rewrite that flips the language.
 * Comparing raw CJK/Latin *counts* cannot tell "Chinese prompt that mentions
 * README" (3 CJK, 16 Latin → read as English) from a real English prompt, so a
 * faithful Chinese answer to such a draft was reported as a flip. Judging by
 * the CJK share of all letters keeps technical names from deciding the
 * verdict. The bar is low because a Chinese sentence built around an English
 * product name can be mostly Latin by count.
 */
const CJK_SHARE_THRESHOLD = 0.1;
/** CJK characters that make a text Chinese-led even when Latin dominates. */
const CJK_MIN_CHARS = 2;

export function isChineseText(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (cjk < CJK_MIN_CHARS) return false;
  return cjk / (cjk + latin) >= CJK_SHARE_THRESHOLD;
}

/**
 * Whether the rewrite handed the draft's roles to the other side.
 *
 * The enhanced text is an instruction addressed to the assistant, so the
 * draft's 「我」 is the user and its 「你」 is the assistant. A rewrite that makes
 * 「你」 the one who intends the work, and 「我」 the one who advises, has inverted
 * the instruction. Measured on one 16-character draft, 2 of 4 recorded runs did
 * exactly that — and none of them tripped any other rule, which is why this
 * check exists.
 *
 * Deliberately narrow. It fires only when the draft ITSELF states both roles
 * with those meanings (writer intends + reader advises), so a faithful rewrite
 * that merely happens to use both pronouns is untouched. Inside that shape it
 * looks for either half of the swap, because a swapped sentence often leaves
 * one side intact ("请说明你要新增的功能……我会据此梳理实现方案" keeps 「我」
 * giving the advice). Being a closed-shape check is the point: a broader
 * pronoun heuristic would fire on ordinary collaborative drafts.
 *
 * Like every rule here it is a regression guard for the test suite, not a
 * runtime gate.
 */
const DRAFT_WRITER_INTENT_RE = /我[^。！？\n]{0,6}(?:想要|想|要|准备|打算|计划|需要)/;
const DRAFT_READER_ADVICE_RE = /你[^。！？\n]{0,6}(?:给|提|说|出|拿)[^。！？\n]{0,4}(?:意见|建议|看法|方案|主意)/;
const OUTPUT_READER_INTENT_RE = /(?:^|[。；！？\n，,、：:\s])(?:你|您)[^。！？\n]{0,4}(?:想要|想|要|准备|打算|计划|需要)/;
const OUTPUT_WRITER_ADVICE_RE = /我[^。！？\n]{0,10}(?:给出|分析|梳理|判断|评估|建议|谋划)/;

/**
 * @param draft - the text the user submitted.
 * @param output - the enhancement result.
 * @returns whether the two roles were exchanged.
 */
export function hasRoleInversion(draft, output) {
  if (typeof draft !== 'string' || typeof output !== 'string') return false;
  if (!DRAFT_WRITER_INTENT_RE.test(draft) || !DRAFT_READER_ADVICE_RE.test(draft)) return false;
  return OUTPUT_READER_INTENT_RE.test(output) || OUTPUT_WRITER_ADVICE_RE.test(output);
}

/**
 * Hard-rule checker for one enhancement result.
 *
 * These are format rules, not a style verdict: they run in the test suite to
 * keep regressions out, and they cannot judge whether a derived dimension was
 * worth adding (the `derivable` rule owns that call).
 * @returns violation messages; empty array means every hard rule passed.
 */
export function checkEnhancedText(input, output) {
  const violations = [];
  if (hasRoleInversion(input, output)) {
    violations.push('输出把原文的主体与受话方互换了（谁提需求 / 谁给意见颠倒）');
  }
  for (const literal of extractLiterals(input)) {
    if (!output.includes(literal)) violations.push(`原文片段未原样保留：${literal}`);
  }
  for (const token of extractPlaceholders(input)) {
    if (!output.includes(token)) violations.push(`原文占位未原样保留：${token}`);
  }
  for (const word of PLACEHOLDER_WORDS) {
    if (output.includes(word) && !input.includes(word)) violations.push(`输出含占位文字：${word}`);
  }
  // A fence or heading the draft already carries is content, not packaging: only
  // an ADDED one is a violation. Without this, a code-block prompt or a headed
  // template could never be rewritten faithfully.
  const outputFenced = output.trim().startsWith('```') || /(?:^|\n)[ \t]*```/.test(output);
  if (outputFenced && !hasBlockFence(input)) {
    violations.push('输出被代码围栏包裹');
  }
  if (hasHeading(output) && !hasHeading(input)) violations.push('输出含 Markdown 标题行');
  if (exceedsBudget(input, output)) {
    violations.push('输出长度超出本次上限');
  }
  for (const token of extractProjectTokens(output)) {
    if (!input.includes(token)) violations.push(`输出新增了原文没有的项目信息：${token}`);
  }
  if (isChineseText(input) !== isChineseText(output)) violations.push('输出语言与原文方向不一致');
  return violations;
}
