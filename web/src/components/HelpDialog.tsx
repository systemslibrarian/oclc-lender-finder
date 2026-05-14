import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Help &amp; shortcuts</DialogTitle>
          <DialogDescription>
            Lender Finder is a faceted search over your OCLC Borrower reports and a
            bundled lender directory. Everything stays in your browser; nothing is
            uploaded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm">
          <section>
            <h3 className="mb-2 font-semibold">Keyboard shortcuts</h3>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <Shortcut keys="1" desc="Switch to Audit" />
              <Shortcut keys="2" desc="Switch to Rankings" />
              <Shortcut keys="3" desc="Switch to Discover" />
              <Shortcut keys="?" desc="Open this help" />
              <Shortcut keys="Esc" desc="Close any open dialog" />
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Audit tab</h3>
            <p className="text-muted-foreground">
              Paste your current custom holdings group. <strong>Cards</strong>{' '}
              view buckets each member Top / Strong / Weak / Unused based on
              how it has performed in your loaded reports — Top is ≥ 70
              composite score, Strong is 50–69, Weak is 1–49, Unused means
              never borrowed from. Click any tier pill at the top to filter.{' '}
              <strong>Tune</strong> view analyzes the group profile and
              recommends drops (with predicted impact) and adds (with
              profile-match reasons) inline.
            </p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Rankings tab</h3>
            <p className="text-muted-foreground">
              Upload <em>Borrower Transaction-Level Detail</em> reports from
              OCLC WorldShare. Each row gets a composite score from five
              weighted subscores — Speed, Fill rate, Volume, Consistency,
              Same state. <strong>Cards</strong> view is sortable + filterable;{' '}
              <strong>Chart</strong> view scatters each lender on a Speed × Fill
              rate plot so top-right performers cluster visually. Pick a
              preset or tune sliders; the list reorders when sorted by "best
              match".
            </p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Discover tab</h3>
            <p className="text-muted-foreground">
              Browse the bundled directory plus the LVIS / FILM / FLIN / LYRA /
              PL@A group rosters. Filter by library type, state, group
              affiliation, OCLC-stated loan turnaround, or distance. Toggle{' '}
              <strong>Map</strong> view to see candidates plotted on
              OpenStreetMap. Import your own CSV under "Custom directory" to
              add rows on top of the bundled set.
            </p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Build a holdings group</h3>
            <p className="text-muted-foreground">
              Tick the checkbox on any card to select it. Click "Build group"
              to name the selection and copy or download it; saved groups stick
              around in your browser via localStorage.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
      <span className="text-muted-foreground">{desc}</span>
    </li>
  );
}
