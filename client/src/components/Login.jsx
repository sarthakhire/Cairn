import { useState } from 'react'
import { USERS, authenticate } from '@/lib/users'
import { ROLES } from '@/lib/roles'

function roleLabel(role) {
  return ROLES.find((item) => item.value === role)?.label ?? role
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function attempt(emailValue, passwordValue) {
    const user = authenticate(emailValue, passwordValue)
    if (!user) {
      setError('Wrong email or password.')
      return
    }
    setError('')
    onLogin(user)
  }

  function handleSubmit(event) {
    event.preventDefault()
    attempt(email, password)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold">
            Handover<span className="font-serif text-4xl italic">Trail</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to see the handover for your role.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border bg-card p-6"
        >
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>

        <section className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Demo accounts
          </p>
          <ul className="space-y-2">
            {USERS.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => attempt(user.email, user.password)}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary/60"
                >
                  <span>{roleLabel(user.role)}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Demo login only. Real sign-in with server-checked tokens comes with
            the backend.
          </p>
        </section>
      </div>
    </div>
  )
}

export default Login