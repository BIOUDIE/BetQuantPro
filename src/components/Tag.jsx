export default function Tag({ children, color }) {
  return (
    <span style={{
      fontSize:      9,
      fontWeight:    700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      padding:       '2px 6px',
      borderRadius:  1,
      background:    color + '22',
      color,
      border:        `1px solid ${color}44`,
    }}>
      {children}
    </span>
  )
}
