import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { HelpCircle, Library } from 'lucide-react';
import { RankingsTab } from '@/tabs/Rankings';
import { DiscoverTab } from '@/tabs/Discover';
import { AuditTab } from '@/tabs/Audit';
import { AppProvider, useAppState } from '@/app-state/AppContext';
import { HelpDialog } from '@/components/HelpDialog';
import type { TabName } from '@/lib/types';

function AppShell() {
  const { activeTab, setActiveTab, months, isLoadingDirectory } = useAppState();
  const [helpOpen, setHelpOpen] = useState(false);

  // Global keyboard shortcuts: 1/2/3 switch tabs, ? opens help. Skip when
  // the user is typing in a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const editable =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (editable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '1') { setActiveTab('audit'); e.preventDefault(); }
      else if (e.key === '2') { setActiveTab('rankings'); e.preventDefault(); }
      else if (e.key === '3') { setActiveTab('discover'); e.preventDefault(); }
      else if (e.key === '?') { setHelpOpen(true); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveTab]);

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
              <TabsTrigger value="audit" className="gap-2">
                <span className="text-xs text-muted-foreground">1</span>Audit
              </TabsTrigger>
              <TabsTrigger value="rankings" className="gap-2">
                <span className="text-xs text-muted-foreground">2</span>Rankings
              </TabsTrigger>
              <TabsTrigger value="discover" className="gap-2">
                <span className="text-xs text-muted-foreground">3</span>Discover
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
            <Button variant="ghost" size="icon" aria-label="Help" onClick={() => setHelpOpen(true)}>
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

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
