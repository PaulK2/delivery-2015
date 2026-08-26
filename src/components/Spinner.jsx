export default function Spinner({ label }) {
  return (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      {label ? <span className="spinner-label">{label}</span> : null}
    </div>
  )
}
