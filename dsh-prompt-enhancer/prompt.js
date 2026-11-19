/**
 * dsh-prompt-enhancer — the enhancement instruction, as data.
 *
 * One prompt, four depth levels. The legacy 1.1.1 prompt and the `framework`
 * switch were removed in 1.1.2: a single prompt decides how far to go from the
 * draft itself (`D0` keep through `D3` high-risk), and the host injects a
 * concrete length ceiling per call. Rules are addressed by stable id, never by
 * ordinal, so re-wording or re-ordering one rule cannot silently satisfy a test.
 */

/** Ordered rules; index order is the rendered numbering. */
export const RULES = [
  { id: 'express', text: '优化表达：消除歧义和口语化说法，明确任务目标、对象、约束与期望输出。' },
  { id: 'fidelity', text: '忠于原意：保留原有意图与语言，不编造原文没有的事实、数据与项目信息。' },
  { id: 'explicit', text: '显式化：把原文隐含的动作、对象和执行顺序写清楚；多个步骤时按顺序分句组织。' },
  { id: 'human', text: '保持人类可读：用自然段落或短句表达，不新增小标题；原文已有结构时保留原结构。' },
  { id: 'concise', text: '简洁优先：不重复、不堆砌；长度以本次上限为准，不为了显得全面而罗列。' },
  { id: 'no-placeholder', text: '不写占位：原文没有的信息直接省略，禁止输出「未指定」「未提供」之类的占位文字。' },
  { id: 'verbatim', text: '原样保留：代码、命令、路径、变量名、字段名、占位符与原文结构逐字保留，不改写、不翻译。' },
  { id: 'passthrough', text: '无法增强时透传：原文完全没有可执行任务时原样输出。若只是对象靠指代（如「你的建议」），把指代写成显式表述并补全顺序，人称保持不变。' },
  { id: 'derivable', text: '补全可推导维度：只在 D1 及以上补「由任务类型必然得出的通用维度」，不得引入原文没有的项目事实。' },
  { id: 'evidence', text: '证据落地：分析、排查、复盘、评审类任务（D2/D3），交付要求里写明依据可查证的记录；记录缺失时说明依据的是哪些推断。' },
  { id: 'minimal-edit', text: '已具体则不摊平：原文已写明动作、约束与交付要求的（D0），只去歧义与顺序补全，不新增步骤、维度、审批或汇报。' },
  { id: 'no-stance', text: '不替用户选立场：不添加原文没有的分析姿态（先反问、假设方案有错、必须给多版方案）。' },
  { id: 'role', text: '角色不互换：原文的主体与受话方保持原样（「我」不得改写成「你」，「你」不得改写成「我」），谁提需求、谁给意见不得颠倒。' },
];

/** Task type → deliverable fields, used only at D2/D3. */
export const DIMENSION_TABLE = [
  { type: 'bug', fields: ['复现条件', '影响范围', '根因', '验证方式'] },
  { type: 'change', fields: ['改动文件', '兼容与回退', '验证方式'] },
  { type: 'review', fields: ['证据来源', '覆盖范围', '结论与依据'] },
  { type: 'retro', fields: ['时间线', '共因判断', '预防措施', '验证'] },
  { type: 'decision', fields: ['选项对比', '代价与风险', '推荐理由'] },
];

/** Chinese label per type, used only to render the menu into the prompt. */
const LABEL = {
  bug: '排查修复',
  change: '改动实施',
  review: '分析评审',
  retro: '复盘总结',
  decision: '选型决策',
};

const HEAD = '你是提示词工程专家。请对用户给出的提示词做优化与结构化改写，让它更清晰、更完整、更容易被执行。';

const DEPTH_SECTION = [
  '先判断深度，再动笔；宁可浅一层，不可深一层：',
  '- D0 保持：原文已写明动作、对象与至少一条约束或验收标准（如「只改这里」「别动别的」「保持行为不变」）。只替换必要的歧义词、整理顺序；不新增分句、不重复原文已有的约束，长度不超过原文的 1.3 倍。',
  '- D1 结构（默认）：有明确动作，但缺对象细节、步骤或交付物。补齐动作、对象、执行顺序与交付物。',
  '- D2 分析：排查、评审、复盘、选型、评估。把下面的清单按该类的 3 项写进交付要求（清单有 4 项时取 3–4 项），并要求证据落地。',
  '- D3 高风险：发布、上线、迁移、删除、对外承诺、不可逆操作。在 D2 基础上补验证方式、回退办法与确认点（最多 2 项）。',
].join('\n');

const DIMENSION_SECTION = [
  '分析型交付字段（D2/D3 覆盖该类全部 3–4 项，不要漏掉验证/结论类字段）：',
  ...DIMENSION_TABLE.map((row) => `- ${LABEL[row.type]}：${row.fields.join('、')}`),
].join('\n');

const TAIL = [
  '输出要求：只输出改写后的提示词本体，不要解释、前言、后缀；不要新增 Markdown 代码围栏或小标题（原文已有则保留）。',
  '输出语言必须与原文一致：中文进中文出，英文进英文出。',
].join('\n');

/**
 * Render the system prompt.
 *
 * `limit` is the host-computed ceiling for this call (`不超过 220 字` or
 * `不超过 80 个英文单词`); `retry` is a one-off corrective hint appended after a
 * language flip. Both are optional so tests can render the base prompt.
 */
export function renderSystemPrompt({ limit = '不超过 220 字', retry = '' } = {}) {
  const parts = [
    HEAD, '',
    DEPTH_SECTION, '',
    '改写原则：',
    ...RULES.map((rule, index) => `${index + 1}. ${rule.text}`), '',
    DIMENSION_SECTION, '',
    TAIL, '',
    `本次改写上限：${limit}。`,
  ];
  if (retry !== '') parts.push('', `补充要求：${retry}。`);
  return parts.join('\n');
}
