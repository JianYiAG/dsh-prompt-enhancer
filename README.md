<div align="center">

<img src="dsh-prompt-enhancer/icon.svg" width="76" height="76" alt="DSH Prompt Enhancer" />

# DSH 提示词增强器

**在输入框写提示词，点一下按钮，模型改写后原位替换。**

[![npm version](https://img.shields.io/npm/v/@jianyiagi/dsh-prompt-enhancer?color=4176E6&label=npm)](https://www.npmjs.com/package/@jianyiagi/dsh-prompt-enhancer)
[![license](https://img.shields.io/npm/l/@jianyiagi/dsh-prompt-enhancer?color=4176E6)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520.3-4176E6)](https://nodejs.org)
[![platform](https://img.shields.io/badge/DSH-Web-4176E6)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](README.md) ｜ [English](README.en.md)

</div>

---

## 它解决什么

写提示词时，你心里想的是「把那个报告看完然后干活」，模型拿到的是同样一句话——意图模糊、缺少步骤、交付物不明，结果自然靠猜。

这个插件把这一步补上：点一下按钮，同一句话变成**明确、可执行、结构完整**的任务描述，然后直接替换回输入框。

```
改写前   把那个报告看完然后干活

改写后   请先完整阅读该报告，再按报告内容执行相应工作。
```

它不是简单润色。当任务本身抽象时，它会补出这件事**本来就该有**的检查维度：

```
改写前   你现在重新扫描工作区文件，找出bug并提出优化方案

改写后   请重新扫描当前工作区的全部文件，系统性地排查潜在 bug，包括逻辑错误、
         边界情况、异常处理缺失、资源泄漏和依赖冲突。对每个问题说明所在文件
         与位置、复现或触发条件、影响程度及根因分析，并按优先级给出具体的
         优化方案和建议的修复方向。
```

但它**不编造**：不引入你没提过的对象、人员、工具、路径、技术栈或项目事实。原文没有的信息，宁可省略。

---

## 安装

### 桌面端

1. 左侧栏进入「插件」页
2. 安装 bundle，填入 `@jianyiagi/dsh-prompt-enhancer`
3. **完全退出应用**后重新打开

### CLI / Web 端

```powershell
dsh plugin --profile <profile> add @jianyiagi/dsh-prompt-enhancer
```

> 安装后若未生效：在「插件」页勾选该插件，或把包名加入 profile `package.json` 的 `dsh.profile.bundles`，然后重启应用。

安装细节与故障排查见 **[DISTRIBUTION.md](DISTRIBUTION.md)**。

---

## 使用

1. 在输入框输入提示词
2. 点击**模型选择器左侧**的闪光按钮
3. 按钮停止转动后，输入框内容已被替换；按钮旁出现**回退按钮**
4. 不满意就点回退，一键恢复原文

| 行为 | 说明 |
|---|---|
| 输入框为空 | 按钮不显示 |
| 手动改动草稿 | 回退按钮自动消失（不覆盖你的编辑） |
| 发送消息后 | 回退按钮消失 |
| 连续增强 | 只保留最近一次的回退点 |

也可以用斜杠命令：

```
/prompt-enhance 提示词
```

结果以命令结果行显示，**不写回输入框**，因此没有回退按钮。

---

## 会挡掉什么

没有实际任务的输入不会被硬编成一个任务。两种情况表现一致：按钮旁显示一行错误提示，**草稿保持原样**。

| 输入 | 结果 |
|---|---|
| `你我`、`你好`、`张三` | 调用前直接拒绝，不消耗模型调用 |
| `嗯。`、`?`、`随你。` | 短句只有标点，同样拒绝 |
| 更长但无任务目标的内容 | 模型原样返回，宿主识别后提示「无法增强」 |

> 这是启发式判断，可能误杀极短的有效提示词（如单个动词）。补上对象即可增强。

---

## 已知限制

- **回退仅当次会话有效**：回退点存在页面状态里，刷新或重启后失效。
- **`@文件` 引用会被拒绝**：插件替换草稿的通道会剥掉引用芯片，引用无法保留。草稿含引用时会直接提示取消——请先发送，或用文字描述文件。
- **增强结果会留在会话里**：结果以命令结果行形式写进会话日志（`recordInput: false` 只避免**原文**进入命令入参记录）。**含敏感内容的草稿请勿用于增强。**
- **长草稿有输出上限**：改写结果上限约 16384 token（约 8192 中文字草稿时达到）。超过约 4000 字的草稿若被大幅扩写，仍可能提示「增强结果超出长度上限」——请分段增强。
- **斜杠命令无回退按钮**：其结果不写回输入框。

---

## 配置

默认使用当前会话的模型。可在 profile 补丁中固定一个模型（例如换成更快的）：

```yaml
- insert:
    - id: prompt-enhancer
      name: '@jianyiagi/dsh-prompt-enhancer'
      config:
        provider: <provider-id>
        model: <model-id>
```

两个字段需**同时**提供；删除 `config` 即恢复使用会话模型。

---

## 用量统计

装了 [`@jianyiagi/dsh-plugin-ui-boost`](https://github.com/JianYiAG)（需带 `__uiBoostAuxReport` 钩子的版本，0.5.2+）时，增强调用的**次数与用途**以「增强」单独统计，不混入对话用量。

> 缓存命中场景下的输入 token 数值以 ui-boost 的口径为准，可能偏低。

---

## 卸载

桌面端在「插件」页卸载；CLI：

```powershell
dsh plugin --profile <profile> remove @jianyiagi/dsh-prompt-enhancer
```

---

## 变更记录

见 **[CHANGELOG.md](dsh-prompt-enhancer/CHANGELOG.md)**。当前版本 **1.1.0**。

---

<div align="center">

**MIT** ｜ [Issues](https://github.com/JianYiAG/dsh-prompt-enhancer/issues) ｜ [Releases](https://github.com/JianYiAG/dsh-prompt-enhancer/releases)

</div>
