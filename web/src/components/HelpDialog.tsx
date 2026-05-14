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
            <h3 className="mb-2 font-semibold">Rankings tab</h3>
            <p className="text-muted-foreground">
              Upload one or more <em>Borrower Transaction-Level Detail</em> reports
              from OCLC WorldShare. Each row gets a composite score from five
              weighted subscores — Speed, Fill rate, Volume, Consistency, Same
              state. Pick a preset or tune the sliders; the list reorders
              automatically when sorted by "best match".
            </p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Discover tab</h3>
            <p className="text-muted-foreground">
              Browse the bundled directory plus the LVIS / FILM / FLIN / LYRA /
              PL@A group rosters. Filter by library type, state, group
              affiliation, OCLC-stated loan turnaround, or distance. Set a Home
              symbol to hide your own library from the list.
            </p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Audit tab</h3>
            <p className="text-muted-foreground">
              Paste your current custom holdings group. Each member is bucketed
              Top / Strong / Weak / Unused based on how it has performed in
              your loaded reports — Top is ≥ 70 composite score, Strong is
              50–69, Weak is 1–49, Unused means never borrowed from.
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
