type DialogKind = 'info' | 'confirm' | 'input' | 'error';

type DialogOptions = {
  kind: DialogKind;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  initialValue?: string;
  placeholder?: string;
  required?: boolean;
  validate?: (value: string) => string | null;
  dedupeKey?: string;
};

type DialogResult = boolean | string | null | void;

type PendingDialog = {
  options: DialogOptions;
  resolve: (value: DialogResult) => void;
};

const ROOT_ID = 'dysto-game-dialog-root';
const TOAST_ROOT_ID = 'dysto-game-toast-root';
const activeByKey = new Map<string, Promise<DialogResult>>();
const queue: PendingDialog[] = [];
let active = false;
let toastSequence = 0;

function ensureToastRoot(): HTMLElement {
  let root = document.getElementById(TOAST_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = TOAST_ROOT_ID;
    root.className = 'game-toast-stack';
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-relevant', 'additions text');
    document.body.append(root);
  }
  return root;
}

function renderNext(): void {
  if (active || queue.length === 0) return;
  active = true;
  const pending = queue.shift()!;
  const { options } = pending;
  const key = options.dedupeKey;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const backdrop = document.createElement('div');
  backdrop.className = 'game-dialog-backdrop';
  backdrop.dataset.kind = options.kind;
  const panel = document.createElement('section');
  panel.className = 'game-dialog-panel';
  panel.setAttribute('role', 'alertdialog' === (options.kind === 'error' ? 'alertdialog' : 'dialog') ? 'alertdialog' : 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'game-dialog-title');
  panel.setAttribute('aria-describedby', 'game-dialog-message');
  panel.tabIndex = -1;

  const header = document.createElement('header');
  header.className = 'game-dialog-header';
  const eyebrow = document.createElement('small');
  eyebrow.className = 'game-dialog-eyebrow';
  eyebrow.textContent = options.kind === 'error' ? 'DYSTO // ERROR' : 'DYSTO // SISTEMA';
  const title = document.createElement('h2');
  title.id = 'game-dialog-title';
  title.textContent = options.title;
  header.append(eyebrow, title);

  const message = document.createElement('p');
  message.id = 'game-dialog-message';
  message.className = 'game-dialog-message';
  message.textContent = options.message;
  panel.append(header, message);

  let input: HTMLInputElement | null = null;
  let validation: HTMLParagraphElement | null = null;
  if (options.kind === 'input') {
    input = document.createElement('input');
    input.className = 'game-dialog-input';
    input.type = 'text';
    input.value = options.initialValue ?? '';
    input.placeholder = options.placeholder ?? '';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', options.title);
    if (options.required) input.required = true;
    validation = document.createElement('p');
    validation.className = 'game-dialog-validation';
    validation.setAttribute('aria-live', 'polite');
    panel.append(input, validation);
  }

  const actions = document.createElement('footer');
  actions.className = 'game-dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'game-dialog-button secondary';
  cancel.textContent = options.cancelLabel ?? (options.kind === 'confirm' || options.kind === 'input' ? 'CANCELAR' : 'CERRAR');
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'game-dialog-button primary';
  confirm.textContent = options.confirmLabel ?? (options.kind === 'confirm' ? 'ACEPTAR' : options.kind === 'input' ? 'CONFIRMAR' : 'ENTENDIDO');

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.append(panel);
  backdrop.append(root);
  document.body.append(backdrop);

  let settled = false;
  const finish = (value: DialogResult) => {
    if (settled) return;
    settled = true;
    document.removeEventListener('keydown', onKeyDown, true);
    backdrop.remove();
    if (key) activeByKey.delete(key);
    active = false;
    pending.resolve(value);
    if (previousFocus?.isConnected) previousFocus.focus();
    queueMicrotask(renderNext);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish(options.kind === 'confirm' ? false : options.kind === 'input' ? null : undefined);
      return;
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
      if (focusable.length === 0) { event.preventDefault(); panel.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  cancel.addEventListener('click', () => finish(options.kind === 'confirm' ? false : options.kind === 'input' ? null : undefined));
  confirm.addEventListener('click', () => {
    if (input) {
      const value = input.value.trim();
      const error = options.required && !value ? 'Este campo es obligatorio.' : options.validate?.(value) ?? null;
      if (error) {
        if (validation) validation.textContent = error;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      finish(value);
    } else {
      finish(options.kind === 'confirm' ? true : undefined);
    }
  });
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop && options.kind !== 'error') {
      finish(options.kind === 'confirm' ? false : options.kind === 'input' ? null : undefined);
    }
  });
  document.addEventListener('keydown', onKeyDown, true);
  if (options.kind === 'confirm' || options.kind === 'input') actions.append(cancel, confirm);
  else actions.append(confirm);
  panel.append(actions);
  (input ?? confirm).focus();
}

function openDialog(options: DialogOptions): Promise<DialogResult> {
  if (options.dedupeKey) {
    const existing = activeByKey.get(options.dedupeKey);
    if (existing) return existing;
  }
  const promise = new Promise<DialogResult>(resolve => {
    queue.push({ options, resolve });
    queueMicrotask(renderNext);
  });
  if (options.dedupeKey) activeByKey.set(options.dedupeKey, promise);
  return promise;
}

export const GameDialog = {
  info(message: string, title = 'INFORMACIÓN'): Promise<void> {
    return openDialog({ kind: 'info', title, message }) as Promise<void>;
  },
  confirm(message: string, title = 'CONFIRMAR ACCIÓN', dedupeKey?: string): Promise<boolean> {
    return openDialog({ kind: 'confirm', title, message, dedupeKey }) as Promise<boolean>;
  },
  input(options: { message: string; title?: string; initialValue?: string; placeholder?: string; required?: boolean; validate?: (value: string) => string | null }): Promise<string | null> {
    return openDialog({ kind: 'input', title: options.title ?? 'INGRESAR DATO', message: options.message, initialValue: options.initialValue, placeholder: options.placeholder, required: options.required, validate: options.validate }) as Promise<string | null>;
  },
  error(message: string, title = 'ERROR DEL SISTEMA', dedupeKey?: string): Promise<void> {
    return openDialog({ kind: 'error', title, message, dedupeKey, confirmLabel: 'CERRAR' }) as Promise<void>;
  },
  toast(message: string, options: { title?: string; durationMs?: number; kind?: 'info' | 'error'; dedupeKey?: string } = {}): void {
    const root = ensureToastRoot();
    if (options.dedupeKey && root.querySelector('[data-dedupe-key="' + CSS.escape(options.dedupeKey) + '"]')) return;
    const toast = document.createElement('section');
    toast.className = 'game-toast' + (options.kind === 'error' ? ' is-error' : '');
    toast.setAttribute('role', options.kind === 'error' ? 'alert' : 'status');
    toast.dataset.toastId = String(++toastSequence);
    if (options.dedupeKey) toast.dataset.dedupeKey = options.dedupeKey;
    const title = document.createElement('strong');
    title.textContent = options.title ?? (options.kind === 'error' ? 'ERROR' : 'AVISO');
    const body = document.createElement('p');
    body.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'game-toast-close';
    close.setAttribute('aria-label', 'Cerrar aviso');
    close.textContent = '×';
    toast.append(title, body, close);
    root.append(toast);
    let timer = 0;
    const remove = () => { window.clearTimeout(timer); toast.remove(); };
    close.addEventListener('click', remove);
    if (options.kind !== 'error') timer = window.setTimeout(remove, Math.max(1500, options.durationMs ?? 4500));
  }
};
