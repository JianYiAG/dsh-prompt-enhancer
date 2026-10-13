# DSH Prompt Enhancer

[简体中文](README.md) ｜ **English**

A DeepSeek Harness (DSH) plugin. Type a prompt in the composer, click the button, and the model rewrites it in place.

- Package: `@jianyiagi/dsh-prompt-enhancer`
- Repository: https://github.com/JianYiAG/dsh-prompt-enhancer
- License: MIT

---

## Install

**Desktop app**

1. Open the **Plugins** page in the left sidebar
2. Install bundle, enter `@jianyiagi/dsh-prompt-enhancer`
3. Quit the app completely, then start it again

**CLI / Web**

```powershell
dsh plugin --profile <profile> add @jianyiagi/dsh-prompt-enhancer
```

If it does not take effect after a restart, tick the plugin on the Plugins page, or add the package name to `dsh.profile.bundles` in the profile `package.json`, then restart the app.

Install details and troubleshooting: [DISTRIBUTION.en.md](DISTRIBUTION.en.md)

---

## Usage

1. Type a prompt in the composer
2. Click the button to the left of the model selector
3. When the button stops spinning, the draft has been replaced with the rewritten prompt. Undo inside the composer if you do not like it

The button is hidden while the composer is empty.

You can also type `/prompt-enhance <prompt>`; the result appears as a command result line and is not written back to the composer.

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

## Uninstall

Untick it on the Plugins page, or:

```powershell
dsh plugin --profile <profile> remove @jianyiagi/dsh-prompt-enhancer
```

---

MIT
