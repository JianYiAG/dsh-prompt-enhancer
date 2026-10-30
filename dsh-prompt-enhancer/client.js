/**
 * dsh-prompt-enhancer — browser half.
 *
 * Injects a one-click enhancement button into the composer tool row
 * (`conversation.input.right`, immediately left of the model selector).
 * The button renders only while the draft is non-empty; a click runs the
 * host `/prompt-enhance` command and replaces the whole draft with the
 * returned text through the standard `inputActions.setDraft` face.
 *
 * After a successful enhancement a rollback button appears next to it and
 * restores the pre-enhancement draft; it disappears as soon as the draft is
 * edited by hand or cleared (message sent).
 */
window.__ModuleLoader__.load({
  id: '@jianyiagi/dsh-prompt-enhancer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'prompt-enhancer';

    const CSS = [
      '.pe-error{font-size:12px;line-height:20px;white-space:nowrap;',
      'color:var(--dsw-alias-state-error-primary);margin-right:6px;',
      'max-width:240px;overflow:hidden;text-overflow:ellipsis}',
      '.pe-button{box-sizing:border-box;display:inline-flex;flex:none;',
      'align-items:center;justify-content:center;width:28px;height:28px;',
      'padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;',
      'background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.pe-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);',
      'color:var(--dsw-alias-label-primary)}',
      '.pe-button:disabled{cursor:default;opacity:.7}',
      '.pe-button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid',
      'var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}',
      '.pe-spinner{box-sizing:border-box;width:12px;height:12px;border-radius:50%;',
      'border:2px solid currentColor;border-top-color:transparent;',
      'animation:pe-spin .6s linear infinite}',
      '@keyframes pe-spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.pe-spinner{animation:none}}',
      '.pe-button + .pe-button{margin-left:6px}',
    ].join('');

    /**
     * Install this bundle's stylesheet once, in module scope.
     *
     * Rendering `<style>` inside the component put one copy of the rule block in
     * the tree per mounted instance (one per open session) and dropped/ rebuilt
     * them on every session switch. This is the official pattern: a singleton
     * `<style data-plugin-css>` looked up by id, so repeated evaluation is
     * idempotent and unmounting a button never removes shared CSS.
     */
    const CSS_TAG_ID = '@jianyiagi/dsh-prompt-enhancer/client.css';
    function installStyles() {
      if (typeof document === 'undefined') return;
      if (document.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]') !== null) return;
      const tag = document.createElement('style');
      tag.dataset.plugin = '@jianyiagi/dsh-prompt-enhancer';
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }
    installStyles();

    const ICON = h('svg', {
      viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true,
      style: { display: 'block' },
    }, h('path', {
      fill: 'currentColor',
      d: 'M8 1.5l1.6 4.4L14 7.5l-4.4 1.6L8 13.5 6.4 9.1 2 7.5l4.4-1.6z',
    }), h('path', {
      fill: 'currentColor', opacity: 0.7,
      d: 'M12.8 10.2l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z',
    }));

    const SPINNER = h('span', { className: 'pe-spinner', 'aria-hidden': true });

    const ROLLBACK_ICON = h('svg', {
      viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true,
      style: { display: 'block' },
    }, h('path', {
      fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      d: 'M2.5 8h7.8a3.2 3.2 0 1 1 0 6.4H8.2',
    }), h('path', {
      fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      d: 'M4.8 5.6L2.5 8l2.3 2.4',
    }));

    const ZH = {
      'button.title': '增强提示词',
      'rollback.title': '回退到增强前的提示词',
      'error.unknown': '命令无响应，请重试',
      'error.empty': '模型未返回增强结果',
      'error.failed': '增强失败',
      'error.changed': '草稿已改动，未替换；请重新点击增强',
      'error.references': '草稿含 @文件 引用，增强会丢失引用，已取消；请先发送或用文字描述',
    };

    const EN = {
      'button.title': 'Enhance prompt',
      'rollback.title': 'Restore the prompt before enhancement',
      'error.unknown': 'No response from the command — try again',
      'error.empty': 'Model returned nothing',
      'error.failed': 'Enhancement failed',
      'error.changed': 'Draft changed while enhancing; not replaced — click again',
      'error.references': 'The draft has @file references that enhancing would drop; cancelled — send it first or describe it in words',
    };

    /**
     * Private-use code points the composer uses for @file reference chips.
     *
     * `inputActions.setDraft` strips these from whatever text it is handed and
     * rebuilds the draft from plain paragraphs, so passing enhanced text back
     * through it can only lose the references — see `dsh-client-ui-conversation`
     * (`REFERENCE_PLACEHOLDER_RE = /[\uE100-\uE11D\uFFFC]/gu`).
     */
    const REFERENCE_PLACEHOLDER_RE = /[\uE100-\uE11D\uFFFC]/u;

    function EnhanceButton({ useInput, inputActions, enhance, t }) {
      const draft = useInput((state) => state.draft) ?? '';
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const errorTimer = React.useRef(0);
      // Snapshot of the last successful enhancement: {original, enhanced}.
      // Powers the rollback button; session-lifetime only (component state).
      const [rollback, setRollback] = React.useState(null);
      // Latest draft, readable after an await. `draft` is a render-time value,
      // so a handler awaiting the model would only ever see the click-time text.
      const draftRef = React.useRef(draft);
      draftRef.current = draft;
      // Synchronous in-flight latch. `busy` only takes effect on the next
      // render, so a second click in the same frame still reads `busy === false`.
      const busyRef = React.useRef(false);
      React.useEffect(() => () => window.clearTimeout(errorTimer.current), []);
      // Draft cleared (message sent): drop the rollback point.
      React.useEffect(() => {
        if (draft.trim() === '') setRollback(null);
      }, [draft]);
      if (draft.trim() === '') return null;
      const flashError = (message) => {
        setError(message);
        window.clearTimeout(errorTimer.current);
        errorTimer.current = window.setTimeout(() => setError(''), 4000);
      };
      const onClick = async () => {
        if (busyRef.current) return;
        const original = draft;
        // `setDraft` sanitizes reference placeholders out of the text it is
        // given, and the model's answer carries none, so an @file chip in the
        // draft can only be lost — the file name would disappear and the draft
        // would come back as plain prose. Refusing is the honest outcome: the
        // chip cannot be rebuilt through this channel.
        if (REFERENCE_PLACEHOLDER_RE.test(original)) {
          flashError(t('error.references'));
          return;
        }
        busyRef.current = true;
        setBusy(true);
        setError('');
        try {
          const result = await enhance(original);
          if (!result.ok) {
            flashError(result.error?.message ?? t('error.failed'));
            return;
          }
          const value = result.value;
          if (value === undefined) {
            flashError(t('error.unknown'));
            return;
          }
          if (value.result.kind === 'error') {
            flashError(value.result.text);
            return;
          }
          const text = (value.result.text ?? '').trim();
          if (text === '') {
            flashError(t('error.empty'));
            return;
          }
          // The enhancement takes seconds; the user may have kept typing in the
          // meantime. Overwriting then would silently discard their edit, so
          // only replace a draft that is still the one we sent.
          if (draftRef.current !== original) {
            flashError(t('error.changed'));
            return;
          }
          inputActions.setDraft(text);
          setRollback({ original, enhanced: text });
        } catch (thrown) {
          flashError(thrown?.message ?? String(thrown));
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      };
      // Rollback is offered only while the draft still equals the last
      // enhanced text: a manual edit means the user's text wins. Compared
      // without trimming, so a stray space counts as an edit.
      const canRollback = rollback !== null && draft === rollback.enhanced;
      return h(React.Fragment, null,
        error === '' ? null : h('span', {
          key: 'pe-error', className: 'pe-error', role: 'status',
        }, error),
        h('button', {
          key: 'pe-button',
          type: 'button',
          className: 'pe-button',
          title: t('button.title'),
          'aria-label': t('button.title'),
          disabled: busy,
          onMouseDown: (event) => event.preventDefault(),
          onClick,
        }, busy ? SPINNER : ICON),
        canRollback ? h('button', {
          key: 'pe-rollback',
          type: 'button',
          className: 'pe-button',
          title: t('rollback.title'),
          'aria-label': t('rollback.title'),
          disabled: busy,
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => {
            inputActions.setDraft(rollback.original);
            setRollback(null);
          },
        }, ROLLBACK_ICON) : null,
      );
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'prompt-enhancer: locale');
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'prompt-enhancer-button',
          order: 10,
          locale: NS,
          inject: (sessionId) => ({
            enhance: (draft) => ctx.remote.commands.execute(sessionId, `/prompt-enhance ${draft}`, []),
          }),
        }, EnhanceButton));
      },
    };
  },
});
