import Modal from './Modal.jsx'

// Small confirmation dialog for destructive actions (delete, etc.).
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Изтрий',
  cancelLabel = 'Отказ',
  onConfirm,
  onClose,
  busy = false,
  danger = true,
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={'btn ' + (danger ? 'btn--danger' : 'btn--primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Изтриване…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  )
}
