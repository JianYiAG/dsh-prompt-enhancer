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
  '2. 忠于原意：保留原有意图与语言，不编造原文没有的事实、数据与项目信息（中文进中文出，英文进英文出）。',
  '3. 显式化：把原文隐含的动作、对象和执行顺序写清楚；包含多个步骤时按顺序分句组织（先……再……然后……），不要强行合并成一句。',
  '4. 保持人类可读：一律用自然流畅的段落或短句表达，禁止使用小标题分节；读起来要像人写的需求说明。',
  '5. 简洁优先：不重复表述，同一个词语不在句中反复出现，能合并的合并；为了清晰和可执行可以展开，但不要堆砌空话，改写后的长度不要超过原文两倍加 80 字。',
  '6. 不写占位：原文没有的信息直接省略，禁止输出「未指定」「未提供」「未明确」之类的占位文字。',
  '7. 原样保留：涉及代码、命令、路径、变量名、字段名等内容时原样保留，不要改写或翻译；文档、报告、文件名可以用《》标注。',
  '8. 无法增强时透传：若原文不包含可执行的任务目标（仅为词语、人名、无动作的片段或内容过短），不要为其编造任务，原样输出原文。',
  '9. 补全可推导维度：把原文中抽象、笼统的执行对象展开为由任务类型必然得出的通用维度（例如"找出 bug"可展开为逻辑错误、边界情况、异常处理缺失、资源泄漏、依赖冲突），并可为交付物写明字段结构（例如问题所在位置、触发条件、影响程度、根因、修复方向）。这类补全不视为编造。但不得引入原文没有的具体对象、人员、工具、路径、技术栈或项目事实，也不得为了凑长度重复堆砌。',
  '',
  '输出要求：只输出改写后的提示词本体，不要解释、前言、后缀，不要使用 Markdown 代码围栏或其他包装。',
].join('\n');

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
 * Book-title marks are deliberately *excluded*: SYSTEM_PROMPT principle 7 tells
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
 * SYSTEM_PROMPT principle 8 tells the model to pass through drafts that
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

/** Normalize raw model output into replacement draft text; `''` when unusable. */
export function normalizeEnhancedText(raw) {
  if (typeof raw !== 'string') return '';
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
 * Largest output/input length ratio outside the fixed slack.
 *
 * SYSTEM_PROMPT principle 9 lets the model expand an abstract target into the
 * generic dimensions that follow from the task type ("find bugs" → logic
 * errors / edge cases / missing error handling / leaks / dependency
 * conflicts) and spell out the report fields. That is legitimate but costs
 * length, and the cost is *fixed*: listing five dimensions and five fields
 * spends roughly the same 90 characters whether the draft is 20 characters or
 * 400. A pure ratio therefore over-penalises short drafts and under-penalises
 * long ones, so the budget is `MAX_GROWTH_RATIO × input + GROWTH_ABSOLUTE_SLACK`.
 *
 * Calibrated against the observed pairs: the spec-style reference (21 → 114)
 * needs at least 2× + 75, while a padded rewrite (52 → 208) must still be
 * rejected, which caps the slack below 26 at ratio 3.5 — no pure-ratio model
 * separates them. 2× + 80 fits every faithful sample with headroom (the
 * reference uses 93% of its budget) and rejects the padded one at 113%.
 * Measured on characters, not bytes.
 */
export const MAX_GROWTH_RATIO = 2;

/**
 * Fixed character allowance on top of `MAX_GROWTH_RATIO`.
 *
 * Covers the fixed cost of spelling out derivable dimensions, so the cap
 * measures inflation rather than specification. See `MAX_GROWTH_RATIO`.
 */
export const GROWTH_ABSOLUTE_SLACK = 80;

/**
 * Shortest input the growth cap applies to (characters, whitespace removed).
 *
 * A terse draft has to grow to become executable — "把那个报告看完然后干活"
 * (11 chars) legitimately becomes 23 — so the ratio is only meaningful once
 * the draft already carries enough content to enhance rather than supply.
 */
export const MIN_GROWTH_CHECK_CHARS = 20;

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
 * Principle 9 permits generic dimensions but forbids project facts. The only
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

function isChineseText(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (cjk < CJK_MIN_CHARS) return false;
  return cjk / (cjk + latin) >= CJK_SHARE_THRESHOLD;
}

/**
 * Hard-rule checker for one enhancement result.
 *
 * These are format rules, not a style verdict: they run in the test suite to
 * keep regressions out, and they cannot judge whether a derived dimension was
 * worth adding (principle 9 owns that call).
 * @returns violation messages; empty array means every hard rule passed.
 */
export function checkEnhancedText(input, output) {
  const violations = [];
  for (const literal of extractLiterals(input)) {
    if (!output.includes(literal)) violations.push(`原文片段未原样保留：${literal}`);
  }
  for (const word of PLACEHOLDER_WORDS) {
    if (output.includes(word) && !input.includes(word)) violations.push(`输出含占位文字：${word}`);
  }
  if (output.trim().startsWith('```') || /(?:^|\n)[ \t]*```/.test(output)) {
    violations.push('输出被代码围栏包裹');
  }
  if (/^#{1,6}\s/m.test(output)) violations.push('输出含 Markdown 标题行');
  const compactInput = input.replace(/\s+/g, '');
  const compactOutput = output.replace(/\s+/g, '');
  if (compactInput.length >= MIN_GROWTH_CHECK_CHARS
    && compactOutput.length > compactInput.length * MAX_GROWTH_RATIO + GROWTH_ABSOLUTE_SLACK) {
    violations.push(`输出长度超出增长预算（原文 ${MAX_GROWTH_RATIO} 倍 + ${GROWTH_ABSOLUTE_SLACK} 字）`);
  }
  for (const token of extractProjectTokens(output)) {
    if (!input.includes(token)) violations.push(`输出新增了原文没有的项目信息：${token}`);
  }
  if (isChineseText(input) !== isChineseText(output)) violations.push('输出语言与原文方向不一致');
  return violations;
}
