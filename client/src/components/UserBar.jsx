import { ROLES } from '@/lib/roles'

function UserBar({ user, onLogout }) {
  const label = ROLES.find((item) => item.value === user.role)?.label ?? user.role

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>
        Signed in as <span className="text-foreground">{label}</span>
      </span>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent"
      >
        Log out
      </button>
    </div>
  )
}

export default UserBar