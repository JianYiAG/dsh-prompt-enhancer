/**
 * dsh-prompt-enhancer — browser half.
 *
 * Injects a one-click enhancement button into the composer tool row
 * (`conversation.input.right`, immediately left of the model selector).
 * The button renders only while the draft is non-empty; a click runs the
 * host `/prompt-enhance` command and replaces the whole draft with the
 * returned text through the standard `inputActions.setDraft` face.
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
    ].join('');

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

    const ZH = {
      'button.title': '增强提示词',
      'error.unknown': '命令未匹配',
      'error.empty': '模型未返回增强结果',
      'error.failed': '增强失败',
    };

    const EN = {
      'button.title': 'Enhance prompt',
      'error.unknown': 'Command not matched',
      'error.empty': 'Model returned nothing',
      'error.failed': 'Enhancement failed',
    };

    function EnhanceButton({ useInput, inputActions, enhance, t }) {
      const draft = useInput((state) => state.draft) ?? '';
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const errorTimer = React.useRef(0);
      React.useEffect(() => () => window.clearTimeout(errorTimer.current), []);
      if (draft.trim() === '') return null;
      const flashError = (message) => {
        setError(message);
        window.clearTimeout(errorTimer.current);
        errorTimer.current = window.setTimeout(() => setError(''), 4000);
      };
      const onClick = async () => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          const result = await enhance(draft);
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
          inputActions.setDraft(text);
        } catch (thrown) {
          flashError(thrown?.message ?? String(thrown));
        } finally {
          setBusy(false);
        }
      };
      return h(React.Fragment, null,
        h('style', { key: 'pe-style' }, CSS),
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
