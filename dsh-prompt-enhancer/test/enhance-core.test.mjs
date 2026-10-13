import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SYSTEM_PROMPT, MAX_INPUT_BYTES, MAX_OUTPUT_TOKENS, TIMEOUT_MS, ENHANCE_SOURCE_KIND,
  trimDraft, normalizeEnhancedText, finishError, resolveRoute, resolvePinnedRoute,
} from '../enhance-core.js';

const headerSession = (config) => ({
  requestHeader: () => (config === undefined ? undefined : { config }),
});

test('trimDraft removes the separator whitespace parseCommand keeps', () => {
  assert.equal(trimDraft(' 帮我写一首诗'), '帮我写一首诗');
  assert.equal(trimDraft('\n\t多行\n提示词'), '多行\n提示词');
  assert.equal(trimDraft('没有分隔符'), '没有分隔符');
});

test('normalizeEnhancedText trims and unwraps a whole-output fence', () => {
  assert.equal(normalizeEnhancedText('  优化后的提示词  '), '优化后的提示词');
  assert.equal(normalizeEnhancedText('```\n优化后的提示词\n```'), '优化后的提示词');
  assert.equal(normalizeEnhancedText('```markdown\n# 标题\n内容\n```'), '# 标题\n内容');
  assert.equal(normalizeEnhancedText('文本里有 ``` 行内代码``` 片段'), '文本里有 ``` 行内代码``` 片段');
});

test('normalizeEnhancedText returns empty for unusable output', () => {
  assert.equal(normalizeEnhancedText(''), '');
  assert.equal(normalizeEnhancedText('   \n\t '), '');
  assert.equal(normalizeEnhancedText('```\n\n```'), '');
});

test('finishError maps terminal reasons', () => {
  assert.equal(finishError({ kind: 'stop' }), undefined);
  assert.equal(finishError({ kind: 'error', failure: { message: 'boom', code: 'x' } }).message, 'boom');
  assert.equal(finishError({ kind: 'aborted', failure: { message: 'cancelled' } }).message, 'cancelled');
  assert.match(finishError({ kind: 'max-tokens' }).message, /长度上限/);
  assert.match(finishError({ kind: 'tool-calls' }).message, /工具/);
  assert.match(finishError({ kind: 'weird' }).message, /不支持的结束原因/);
});

test('resolveRoute prefers the pending projection selection', () => {
  const ctx = {
    sessionProjections: { stateOf: () => ({ pending: { provider: 'p1', model: 'm1' }, lastUsed: null }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'pd', model: 'md' }) },
  };
  const agent = { session: headerSession({ provider: 'ph', model: 'mh' }) };
  assert.deepEqual(resolveRoute(ctx, agent), { provider: 'p1', model: 'm1' });
});

test('resolveRoute falls back to the logged request header', () => {
  const ctx = {
    sessionProjections: { stateOf: () => ({ pending: null, lastUsed: null }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'pd', model: 'md' }) },
  };
  const agent = { session: headerSession({ provider: 'ph', model: 'mh' }) };
  assert.deepEqual(resolveRoute(ctx, agent), { provider: 'ph', model: 'mh' });
});

test('resolveRoute falls back to the default model', () => {
  const ctx = {
    sessionProjections: { stateOf: () => ({ pending: null, lastUsed: null }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'pd', model: 'md' }) },
  };
  const agent = { session: headerSession(undefined) };
  assert.deepEqual(resolveRoute(ctx, agent), { provider: 'pd', model: 'md' });
});

test('resolveRoute returns undefined when nothing resolves', () => {
  const ctx = { sessionProjections: undefined, agentDefaultModel: undefined };
  const agent = { session: headerSession(undefined) };
  assert.equal(resolveRoute(ctx, agent), undefined);
});

test('resolveRoute skips an incomplete pending selection', () => {
  const ctx = {
    sessionProjections: { stateOf: () => ({ pending: { provider: 'p1' }, lastUsed: null }) },
    agentDefaultModel: undefined,
  };
  const agent = { session: headerSession({ provider: 'ph', model: 'mh' }) };
  assert.deepEqual(resolveRoute(ctx, agent), { provider: 'ph', model: 'mh' });
});

test('constants match the spec', () => {
  assert.equal(MAX_INPUT_BYTES, 24576);
  assert.equal(MAX_OUTPUT_TOKENS, 4096);
  assert.equal(TIMEOUT_MS, 60000);
  assert.equal(ENHANCE_SOURCE_KIND, 'prompt-enhancer');
  assert.match(SYSTEM_PROMPT, /结构化/);
  assert.match(SYSTEM_PROMPT, /代码围栏/);
  assert.match(SYSTEM_PROMPT, /未指定/);
  assert.match(SYSTEM_PROMPT, /人类可读/);
  assert.match(SYSTEM_PROMPT, /不要明显长于原文/);
  assert.match(SYSTEM_PROMPT, /禁止使用小标题/);
  assert.match(SYSTEM_PROMPT, /原样保留/);
});

test('resolvePinnedRoute accepts a complete trimmed pin', () => {
  assert.deepEqual(resolvePinnedRoute({ provider: 'p', model: 'm' }), { provider: 'p', model: 'm' });
  assert.deepEqual(resolvePinnedRoute({ provider: ' p ', model: ' m ' }), { provider: 'p', model: 'm' });
});

test('resolvePinnedRoute ignores missing or partial pins', () => {
  assert.equal(resolvePinnedRoute(undefined), undefined);
  assert.equal(resolvePinnedRoute({}), undefined);
  assert.equal(resolvePinnedRoute({ provider: 'p' }), undefined);
  assert.equal(resolvePinnedRoute({ model: 'm' }), undefined);
  assert.equal(resolvePinnedRoute({ provider: '', model: 'm' }), undefined);
  assert.equal(resolvePinnedRoute({ provider: 'p', model: '   ' }), undefined);
  assert.equal(resolvePinnedRoute({ provider: 42, model: 'm' }), undefined);
});
