# DSH 提示词增强器

**简体中文** ｜ [English](README.en.md)

DeepSeek Harness（DSH）插件。在输入框写提示词，点一下按钮，模型改写后替换输入框内容。

- 包名：`@jianyiagi/dsh-prompt-enhancer`
- 仓库：https://github.com/JianYiAG/dsh-prompt-enhancer
- 许可：MIT

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

安装与常见问题见 [DISTRIBUTION.md](DISTRIBUTION.md)。

---

## 使用

1. 在输入框输入提示词
2. 点模型选择器左侧的按钮
3. 按钮停止转动后，输入框内容已替换为改写结果；不满意可在输入框内撤销

输入框为空时按钮不显示。

也可输入 `/prompt-enhance 提示词`，结果以命令结果行显示，不写回输入框。

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

MIT
