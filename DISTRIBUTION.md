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

---

## 使用

1. 在输入框输入提示词
2. 点模型选择器左侧的按钮
3. 按钮停止转动后，输入框内容已替换为改写结果；不满意可在输入框内撤销

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
