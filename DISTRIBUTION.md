# 安装与使用

**简体中文** ｜ [English](DISTRIBUTION.en.md)

DSH 提示词增强器 · 包名 `@jianyiagi/dsh-prompt-enhancer` · 仓库 https://github.com/JianYiAG/dsh-prompt-enhancer

---

## 环境要求

- DeepSeek Harness 桌面端，或 CLI / Web 端
- 已配置可用的模型服务

---

## 安装

### 桌面端

1. 左侧栏进「插件」页
2. 安装 bundle，填 `@jianyiagi/dsh-prompt-enhancer`
3. 完全退出应用后重新打开

### CLI / Web 端

```powershell
dsh plugin --profile <profile> add @jianyiagi/dsh-prompt-enhancer
```

若 `dsh` 不在 PATH，改用 DSH 安装目录下的 bin：

```powershell
node "<dsh-app>\lib\bin.js" plugin --profile=<profile> add @jianyiagi/dsh-prompt-enhancer
```

### 安装后确认

1. 在「插件」页确认该插件已勾选（CLI 安装后需要这一步）
2. 输入框工具行、模型选择器左侧出现按钮；输入框为空时不显示
3. 输入框输入 `/`，菜单中可见 `prompt-enhance`
4. 输入任意提示词点一次增强，按钮停止转动后其右侧应出现回退按钮（有回退按钮即表示安装的是 1.1.0 或更新版本）

---

## 使用

1. 在输入框输入提示词
2. 点模型选择器左侧的按钮
3. 按钮停止转动后，输入框内容已替换为改写结果，同时增强按钮旁出现回退按钮
4. 点回退按钮恢复增强前的提示词；手动改动草稿或发送消息后，回退按钮自动消失

过短或不含任务目标的输入不会被增强，只在按钮旁显示一行错误提示，草稿保持原样。

输入 `/prompt-enhance 提示词` 时，结果以命令结果行显示，不写回输入框。

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

## 常见问题

| 现象 | 处理 |
|---|---|
| 重启后没有按钮 | 在「插件」页勾选该插件；或把包名加入 profile `package.json` 的 `dsh.profile.bundles` 后重启 |
| 点击后按钮旁出现红色文字 | 为错误信息，4 秒后消失。检查模型是否可用、输入是否超过 24 KB |
| 提示「输入过短或缺少任务描述」 | 输入过短或不含任务目标；把要说的事写清楚（补上对象与动作）即可增强 |
| 提示「无法增强：原文缺少可执行的任务目标」 | 模型判定原文没有可执行任务，草稿未被改动；补上任务描述后重试 |
| 增强后没有回退按钮 | 回退按钮仅在增强成功后、且草稿未被手动改动时出现；斜杠命令入口没有回退按钮 |
| 提示「草稿含 @文件 引用…已取消」 | 替换草稿的通道会剥掉引用芯片，引用无法保留；先发送，或把文件写成文字描述 |
| 提示「增强结果超出长度上限」 | 长草稿被大幅扩写所致；把草稿分段增强，或在配置中指定上下文更大的模型 |
| 增强耗时较长 | 在配置中指定固定模型 |
| 对话中出现一行 `prompt-enhance` | 插件的命令记录行，正常显示 |
| `npm` 报 404 | registry 同步延迟，稍后重试 |
| 提示已存在 | 先 remove 再 add |

---

## 卸载

桌面端在「插件」页卸载；CLI：

```powershell
dsh plugin --profile <profile> remove @jianyiagi/dsh-prompt-enhancer
```

---

## 更新

查看最新版本：

```powershell
npm view @jianyiagi/dsh-prompt-enhancer version
```

升级：先卸载再安装，随后重启应用。

---

MIT ｜ 维护者：@jianyiagi
