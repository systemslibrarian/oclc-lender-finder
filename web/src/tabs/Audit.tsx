import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AuditTab() {
  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your current holdings</CardTitle>
            <CardDescription>Paste OCLC symbols to evaluate your existing custom holdings group.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            Textarea + run/clear ports here next.
          </CardContent>
        </Card>
      </aside>
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Audit</CardTitle>
            <CardDescription>Each holding bucketed Top / Strong / Weak / Unused based on your loaded reports.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tier-colored cards port here next.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
