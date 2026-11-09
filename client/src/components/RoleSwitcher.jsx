import { ROLES } from '@/lib/roles'

function RoleSwitcher({ role, onChange }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      View as
      <select
        value={role}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {ROLES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default RoleSwitcher 