import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'

function EvidenceDrawer({ claim, allClaims, onClose, onReview }) {
  const conflicts = claim
    ? allClaims.filter((c) => claim.conflictsWith.includes(c.id))
    : []

  return (
    <Sheet open={claim !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {claim && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <StatusBadge status={claim.status} />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {claim.type.replace('_', ' ')}
                </span>
              </div>
              <SheetTitle className="text-base">{claim.statement}</SheetTitle>
              <SheetDescription>
                Visibility: {claim.visibility}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <section className="space-y-2">
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                  Evidence
                </h3>
                {claim.evidence.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No source evidence for this claim.
                  </p>
                ) : (
                  claim.evidence.map((item, index) => (
                    <blockquote
                      key={index}
                      className="space-y-2 rounded-md border-l-2 border-primary bg-muted p-3"
                    >
                      <p className="font-serif text-lg italic">{item.quote}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.source}, chunk {item.chunk}, {item.date}
                      </p>
                    </blockquote>
                  ))
                )}
              </section>

              {conflicts.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs uppercase tracking-wide text-red-400">
                    Conflicts with
                  </h3>
                  {conflicts.map((other) => (
                    <div
                      key={other.id}
                      className="space-y-1 rounded-md border border-red-500/30 p-3"
                    >
                      <p className="text-sm font-medium">{other.statement}</p>
                      {other.evidence[0] && (
                        <p className="text-xs text-muted-foreground">
                          {other.evidence[0].source}, {other.evidence[0].date}
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {claim.nextAction && (
                <section className="space-y-1">
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                    Next action
                  </h3>
                  <p className="text-sm">{claim.nextAction}</p>
                </section>
              )}

              <section className="space-y-1">
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                  Review
                </h3>
                <p className="text-sm">
                  {claim.review.state}
                  {claim.review.by && ` by ${claim.review.by}`}
                  {claim.review.at && `, ${claim.review.at.replace('T', ' ')}`}
                </p>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default EvidenceDrawer