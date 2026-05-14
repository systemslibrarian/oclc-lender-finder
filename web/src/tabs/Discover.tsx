import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DiscoverTab() {
  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your library</CardTitle>
            <CardDescription>Home symbol, state, lat/long.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">Form fields land here next.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>Library type, state, group, response time.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">Facet groups port here next.</CardContent>
        </Card>
      </aside>
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Discover</CardTitle>
            <CardDescription>Bundled directory + 5 OCLC group rosters (LVIS, FILM, FLIN, LYRA, PL@A).</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Candidate cards, distance sort, OCLC turnaround tiles port here next.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
