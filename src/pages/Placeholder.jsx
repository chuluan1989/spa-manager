import './Placeholder.css'

export default function Placeholder({ title, subtitle }) {
  return (
    <div className="placeholder">
      <h2 className="placeholder__title">{title}</h2>
      <p className="placeholder__subtitle">{subtitle}</p>
    </div>
  )
}
