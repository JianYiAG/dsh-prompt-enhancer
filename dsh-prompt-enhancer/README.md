# @jianyiagi/dsh-prompt-enhancer

**简体中文** ｜ [English](#english)

DSH（DeepSeek Harness）插件。在输入框写提示词，点一下按钮，模型改写后替换输入框内容。

---

## 安装

**桌面端**：

1. 左侧栏进「插件」页
2. 安装 bundle，填 `@jianyiagi/dsh-prompt-enhancer`
3. 完全退出应用后重新打开

**CLI / Web 端**：

```powershell
dsh plugin --profile <profile> add @jianyiagi/dsh-prompt-enhancer
```

CLI 安装后若未生效，在「插件」页勾选该插件，或把包名加入 profile `package.json` 的 `dsh.profile.bundles`，然后重启应用。

---

## 使用

1. 在输入框输入提示词
2. 点模型选择器左侧的按钮
3. 按钮停止转动后，输入框内容已替换为改写结果，同时按钮旁出现回退按钮
4. 点击回退按钮可恢复增强前的提示词；手动改动草稿或发送消息后，回退按钮自动消失

输入框为空时按钮不显示。

过短或不含任务目标的输入（例如只有「你我」两个字的片段、或「嗯。」这类只带句号的短句）不会被增强：要么在调用模型前就被拒绝，要么由模型原样透传后识别。两种情况都只在按钮旁显示一行错误提示，草稿保持原样。

也可输入 `/prompt-enhance 提示词`，结果以命令结果行显示，不写回输入框。

> 装了 `@jianyiagi/dsh-plugin-ui-boost`（需要带 `__uiBoostAuxReport` 钩子的版本，当前为 0.5.2+）时，增强调用的**次数与用途**会以「增强」单独统计，不混进对话用量。缓存命中场景下的输入 token 数值以 ui-boost 的口径为准，可能偏低。

## 已知限制

- 回退仅当次会话有效：回退点存在页面状态里，刷新页面或重启应用后失效。
- 手动改动过草稿后回退按钮消失（避免覆盖你的编辑）；连续增强只保留最近一次的回退点。
- 斜杠命令 `/prompt-enhance` 的结果不写回输入框，因此没有回退按钮。
- 过短输入（剥掉标点后 4 个字符以内且无动词特征）会被直接拒绝，「嗯。」这类只带句号的短句也算；这是启发式判断，可能误杀极短的有效提示词（如单个动词），补上对象即可增强。
- 草稿里带 `@文件` 引用时增强会被拒绝：替换草稿的通道会剥掉引用占位符，引用无法保留。请先发送，或把文件写成文字描述。
- 长草稿有输出上限：改写结果最多约 16384 token（草稿约 8192 中文字时达到上限）。超过约 4000 字的草稿若被模型大幅扩写，仍可能触发「增强结果超出长度上限」，此时请分段增强。
- 增强结果会以命令结果行的形式留在会话里：`recordInput: false` 只避免**原文**进入命令入参记录，**改写后的全文仍会写进会话日志**（插件唯一的客户端→宿主通道是命令注册表）。含敏感内容的草稿请勿用于增强。

---

## 配置

默认使用当前会话的模型。可在 profile 补丁中指定固定模型：

```yaml
- insert:
    - id: prompt-enhancer
      name: '@jianyiagi/dsh-prompt-enhancer'
      config:
        provider: <provider-id>
        model: <model-id>
```

两个字段需同时提供；删除 `config` 即恢复使用会话模型。

---

## 卸载

桌面端在「插件」页卸载；CLI：

```powershell
dsh plugin --profile <profile> remove @jianyiagi/dsh-prompt-enhancer
```

---

## English

DSH (DeepSeek Harness) plugin. Type a prompt in the composer, click the button, and the model rewrites it in place.

### Install

**Desktop app**

1. Open the **Plugins** page in the left sidebar
2. Install bundle, enter `@jianyiagi/dsh-prompt-enhancer`
3. Quit the app completely, then start it again

**CLI / Web**

```powershell
dsh plugin --profile <profile> add @jianyiagi/dsh-prompt-enhancer
```

If it does not take effect after a restart, tick the plugin on the Plugins page, or add the package name to `dsh.profile.bundles` in the profile `package.json`, then restart the app.

### Usage

1. Type a prompt in the composer
2. Click the button to the left of the model selector
3. When the button stops spinning, the draft has been replaced with the rewritten prompt and a rollback button appears next to it
4. Click the rollback button to restore the prompt from before the enhancement; it disappears once you edit the draft by hand or send the message

The button is hidden while the composer is empty.

Drafts that are too short or carry no task goal (for example a bare fragment like 你我, or a short sentence that only adds a full stop like 嗯。) are never enhanced: they are either rejected before the model call or passed through by the model and detected afterwards. Both cases only flash an error next to the button and leave the draft untouched.

You can also type `/prompt-enhance <prompt>`; the result appears as a command result line and is not written back to the composer.

> With `@jianyiagi/dsh-plugin-ui-boost` installed (needs a build exposing the `__uiBoostAuxReport` hook — 0.5.2+), enhancement **calls and purpose** are counted separately under `prompt-enhance` instead of blending into chat usage. When the provider reports cache hits, the input-token figure follows ui-boost's own accounting and may read low.

### Known limitations

- Rollback lasts for the current session only: the restore point lives in page state and is lost on refresh or restart.
- The rollback button disappears once you edit the draft by hand (so it never overwrites your edits); consecutive enhancements keep only the most recent restore point.
- The `/prompt-enhance` slash command does not write back to the composer, so it has no rollback button.
- Drafts of four characters or fewer without verb characters are rejected outright, even when they carry a full stop; this heuristic can block a valid very short prompt (a single verb), which can be enhanced once its object is added.
- A draft containing `@file` references is refused: the draft-replacement channel strips reference placeholders, so the reference cannot survive. Send it first, or describe the file in words.
- Long drafts hit an output budget: the rewritten result is capped at about 16 384 tokens (reached at roughly 8 192 Chinese characters of draft). A draft over ~4 000 characters that the model expands substantially can still end in "enhancement result exceeds the length limit" — enhance it in parts.
- The enhancement result stays in the session as a command result line: `recordInput: false` only keeps the **original** out of the command input record; the **rewritten text is still written to the session log** (the command registry is the plugin's only client-to-host channel). Do not enhance drafts that contain secrets.

### Configuration

By default the current session model is used. To pin a model, add this to the profile patch:

```yaml
- insert:
    - id: prompt-enhancer
      name: '@jianyiagi/dsh-prompt-enhancer'
      config:
        provider: <provider-id>
        model: <model-id>
```

Both fields are required; remove `config` to use the session model again.

### Uninstall

Untick it on the Plugins page, or:

```powershell
dsh plugin --profile <profile> remove @jianyiagi/dsh-prompt-enhancer
```

---

MIT ｜ Repository: https://github.com/JianYiAG/dsh-prompt-enhancer
