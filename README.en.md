<div align="center">

<img src="dsh-prompt-enhancer/icon.svg" width="76" height="76" alt="DSH Prompt Enhancer" />

# DSH Prompt Enhancer

**Type a prompt, click once, and the model rewrites it in place.**

[![npm version](https://img.shields.io/npm/v/@jianyiagi/dsh-prompt-enhancer?color=4176E6&label=npm)](https://www.npmjs.com/package/@jianyiagi/dsh-prompt-enhancer)
[![license](https://img.shields.io/npm/l/@jianyiagi/dsh-prompt-enhancer?color=4176E6)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520.3-4176E6)](https://nodejs.org)
[![platform](https://img.shields.io/badge/DSH-Web-4176E6)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](README.md) ｜ English

</div>

---

## What it solves

You type what you mean. The model receives the same terse sentence — vague intent, no steps, no defined deliverable — and has to guess.

This plugin closes that gap. One click turns the sentence into a **clear, executable, complete** task description and writes it straight back into the composer.

```
before   read the report and then do the work

after    Please read the report in full first, then carry out the work it describes.
```

It does more than polish phrasing. When the task is abstract, it expands it into the dimensions that task type **inherently requires**:

```
before   rescan the workspace and find bugs, then propose fixes

after    Rescan every file in the current workspace and systematically look for
         bugs, including logic errors, edge cases, missing error handling,
         resource leaks and dependency conflicts. For each issue, state the file
         and location, the reproduction or trigger condition, the impact and the
         root cause, then give a concrete fix proposal ranked by priority.
```

But it **invents nothing**: no objects, people, tools, paths, tech stacks or project facts you did not mention. Information the original does not contain is left out rather than fabricated.

---

## Install

### Desktop app

1. Open the **Plugins** page in the left sidebar
2. Install bundle, enter `@jianyiagi/dsh-prompt-enhancer`
3. **Quit the app completely**, then start it again

### CLI / Web

```powershell
dsh plugin --profile <profile> add @jianyiagi/dsh-prompt-enhancer
```

> If it does not take effect after a restart: tick the plugin on the Plugins page, or add the package name to `dsh.profile.bundles` in the profile `package.json`, then restart.

Install details and troubleshooting: **[DISTRIBUTION.en.md](DISTRIBUTION.en.md)**.

---

## Usage

1. Type a prompt in the composer
2. Click the sparkle button **to the left of the model selector**
3. When it stops spinning the draft has been replaced, and a **rollback button** appears beside it
4. Not happy? Click rollback to restore the original

| Behaviour | Detail |
|---|---|
| Composer empty | Button is hidden |
| You edit the draft | Rollback button disappears (your edit wins) |
| Message sent | Rollback button disappears |
| Consecutive enhancements | Only the most recent restore point is kept |

The slash command works too:

```
/prompt-enhance <prompt>
```

The result appears as a command result line and is **not** written back to the composer, so it has no rollback button.

---

## What it refuses

Inputs with no actual task are never padded into a fake one. Both cases behave the same: a one-line error next to the button, and the **draft stays untouched**.

| Input | Result |
|---|---|
| `你我`, `你好`, `张三` | Rejected before the model call — no tokens spent |
| `嗯。`, `?`, `随你。` | Punctuation-only fragments, also rejected |
| Longer text with no task goal | Model echoes it back, host detects it and reports "cannot enhance" |

> This is a heuristic and can block a valid very short prompt (a single verb). Add an object and it enhances.

---

## Known limitations

- **Rollback is session-scoped**: the restore point lives in page state and is lost on refresh or restart.
- **`@file` references are refused**: the draft-replacement channel strips reference chips, so they cannot survive. A draft containing them is cancelled with a message — send it first, or describe the file in words.
- **The result stays in the session**: it is written to the session log as a command result line (`recordInput: false` only keeps the **original** out of the command input record). **Do not enhance drafts containing secrets.**
- **Long drafts hit an output ceiling**: the rewrite is capped at about 16 384 tokens (reached at roughly 8 192 Chinese characters of draft). A draft over ~4 000 characters that the model expands substantially can still end in "enhancement result exceeds the length limit" — enhance it in parts.
- **The slash command has no rollback button**: its result is not written back to the composer.

---

## Configuration

By default the current session model is used. To pin a model (for example, a faster one), add this to the profile patch:

```yaml
- insert:
    - id: prompt-enhancer
      name: '@jianyiagi/dsh-prompt-enhancer'
      config:
        provider: <provider-id>
        model: <model-id>
```

Both fields are required; remove `config` to use the session model again.

---

## Token usage

With [`@jianyiagi/dsh-plugin-ui-boost`](https://github.com/JianYiAG) (needs a build exposing the `__uiBoostAuxReport` hook — 0.5.2+), enhancement **calls and purpose** are counted separately under `prompt-enhance` instead of blending into chat usage.

> When the provider reports cache hits, the input-token figure follows ui-boost's own accounting and may read low.

---

## Uninstall

Untick it on the Plugins page, or:

```powershell
dsh plugin --profile <profile> remove @jianyiagi/dsh-prompt-enhancer
```

---

## Changelog

See **[CHANGELOG.md](dsh-prompt-enhancer/CHANGELOG.md)**. Current version **1.1.0**.

---

<div align="center">

**MIT** ｜ [Issues](https://github.com/JianYiAG/dsh-prompt-enhancer/issues) ｜ [Releases](https://github.com/JianYiAG/dsh-prompt-enhancer/releases)

</div>
