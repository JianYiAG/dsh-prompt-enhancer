# Install and Usage

[简体中文](DISTRIBUTION.md) ｜ **English**

DSH Prompt Enhancer · package `@jianyiagi/dsh-prompt-enhancer` · repository https://github.com/JianYiAG/dsh-prompt-enhancer

---

## Requirements

- DeepSeek Harness desktop app, or CLI / Web
- A configured model provider

---

## Install

### Desktop app

1. Open the **Plugins** page in the left sidebar
2. Install bundle, enter `@jianyiagi/dsh-prompt-enhancer`
3. Quit the app completely, then start it again

### CLI / Web

```powershell
dsh plugin --profile <profile> add @jianyiagi/dsh-prompt-enhancer
```

If `dsh` is not on PATH, use the bin inside the DSH installation:

```powershell
node "<dsh-app>\lib\bin.js" plugin --profile=<profile> add @jianyiagi/dsh-prompt-enhancer
```

### After installing

1. Tick the plugin on the Plugins page (required after a CLI install)
2. A button appears in the composer tool row, to the left of the model selector; it is hidden while the composer is empty
3. Type `/` in the composer; the menu lists `prompt-enhance`

---

## Usage

1. Type a prompt in the composer
2. Click the button to the left of the model selector
3. When the button stops spinning, the draft has been replaced with the rewritten prompt. Undo inside the composer if you do not like it

Typing `/prompt-enhance <prompt>` shows the result as a command result line and does not write it back to the composer.

---

## Configuration

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

---

## Troubleshooting

| Symptom | What to do |
|---|---|
| No button after a restart | Tick the plugin on the Plugins page, or add the package name to `dsh.profile.bundles` in the profile `package.json`, then restart |
| Red text next to the button | Error message, disappears after 4 seconds. Check that the model is available and the input is under 24 KB |
| Enhancement takes long | Pin a model in the configuration |
| A `prompt-enhance` line in the conversation | Command record line of the plugin; expected |
| `npm` returns 404 | Registry sync delay; retry later |
| "already exists" | remove the plugin first, then add it again |

---

## Uninstall

Untick it on the Plugins page, or:

```powershell
dsh plugin --profile <profile> remove @jianyiagi/dsh-prompt-enhancer
```

---

## Update

Check the latest version:

```powershell
npm view @jianyiagi/dsh-prompt-enhancer version
```

To update, uninstall and install again, then restart the app.

---

MIT ｜ Maintainer: @jianyiagi
