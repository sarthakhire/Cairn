import { Component } from 'react'
import { Button } from '@/components/ui/button'

// Catches a render crash anywhere below it and shows a recovery card
// instead of a blank page.
class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Render crash:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div role="alert" className="max-w-md rounded-lg border p-6 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page hit an unexpected problem. Your work on the server is safe. Reload to continue.
          </p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary