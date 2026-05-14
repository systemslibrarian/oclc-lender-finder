import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { HelpCircle, Library } from 'lucide-react';
import { RankingsTab } from '@/tabs/Rankings';
import { DiscoverTab } from '@/tabs/Discover';
import { AuditTab } from '@/tabs/Audit';
import { AppProvider, useAppState } from '@/app-state/AppContext';
import type { TabName } from '@/lib/types';

function AppShell() {
  const { activeTab, setActiveTab, months, isLoadingDirectory } = useAppState();
  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <Library className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>Lender Finder</span>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabName)} className="ml-2">
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
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-xs text-muted-foreground sm:block">
              {months.length === 0
                ? isLoadingDirectory
                  ? 'Loading directory…'
                  : 'No reports loaded'
                : `${months.length} month${months.length === 1 ? '' : 's'} loaded`}
            </div>
            <Button variant="ghost" size="icon" aria-label="Help">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container flex-1 py-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabName)}>
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

export function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
