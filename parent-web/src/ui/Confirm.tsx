import {useEffect, useRef} from 'react';
import {useI18n} from '../i18n/I18n';

/** "Remove Mia?" — a modal question before anything is deleted (native <dialog>: focus and Esc for free). */
export function Confirm({open, title, text, confirmLabel, busy, onConfirm, onCancel}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const {t} = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onClose={() => open && onCancel()}>
      <h2>{title}</h2>
      <p>{text}</p>
      <div className="button-row">
        <button type="button" className="btn btn-soft" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button type="button" className="btn btn-coral" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
