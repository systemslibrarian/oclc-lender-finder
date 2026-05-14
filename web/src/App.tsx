import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { HelpCircle, Library } from 'lucide-react';
import { RankingsTab } from '@/tabs/Rankings';
import { DiscoverTab } from '@/tabs/Discover';
import { AuditTab } from '@/tabs/Audit';

const TAB_STORAGE_KEY = 'lenderFinder.ui.v1';

function loadInitialTab(): string {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (!raw) return 'rankings';
    const parsed = JSON.parse(raw);
    return parsed?.activeTab && ['rankings', 'discover', 'audit'].includes(parsed.activeTab)
      ? parsed.activeTab
      : 'rankings';
  } catch {
    return 'rankings';
  }
}

export function App() {
  const [activeTab, setActiveTab] = useState<string>(loadInitialTab);

  const onTabChange = (next: string) => {
    setActiveTab(next);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify({ activeTab: next }));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <Library className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>Lender Finder</span>
          </div>
          <Tabs value={activeTab} onValueChange={onTabChange} className="ml-2">
            <TabsList>
              <TabsTrigger value="rankings" className="gap-2">
                <span className="text-xs text-muted-foreground">1</span>Rankings
              </TabsTrigger>
              <TabsTrigger value="discover" className="gap-2">
                <span className="text-xs text-muted-foreground">2</span>Discover
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2">
                <span className="text-xs text-muted-foreground">3</span>Audit
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Help">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container flex-1 py-6">
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsContent value="rankings"><RankingsTab /></TabsContent>
          <TabsContent value="discover"><DiscoverTab /></TabsContent>
          <TabsContent value="audit"><AuditTab /></TabsContent>
        </Tabs>
      </main>

      <footer className="border-t py-4 text-sm text-muted-foreground">
        <div className="container">
          Data stays in your browser — nothing is uploaded to a server.
        </div>
      </footer>
    </div>
  );
}
