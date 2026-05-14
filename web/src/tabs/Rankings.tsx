import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function RankingsTab() {
  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload reports</CardTitle>
            <CardDescription>Drop OCLC Borrower Transaction-Level Detail reports here.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            File upload UI lands here in the next migration pass.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scoring weights</CardTitle>
            <CardDescription>Tune the five subscores or pick a preset.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            Sliders + 6 presets (Balanced, Speed first, Trusted, Same-state, Workhorses, Newcomers OK) come over from vanilla.
          </CardContent>
        </Card>
      </aside>
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Rankings</CardTitle>
            <CardDescription>Loaded lenders, sorted by your weighted score.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Card list, filter chips, and explain panels port here next.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
