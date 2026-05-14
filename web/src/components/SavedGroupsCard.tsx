import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppState, type SavedGroup } from '@/app-state/AppContext';
import { Trash2, Download, ListChecks } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface Props {
  source: 'rankings' | 'discover';
  onRestore: (symbols: string[]) => void;
}

function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function SavedGroupsCard({ source, onRestore }: Props) {
  const { savedGroups, setSavedGroups } = useAppState();
  const toast = useToast();
  if (savedGroups.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Saved holdings groups</CardTitle></CardHeader>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          Select some lenders below and click <strong>Build holdings group</strong> to save and export them.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Saved holdings groups</CardTitle></CardHeader>
      <CardContent className="space-y-2 pt-0">
        {savedGroups.map((g, i) => (
          <SavedGroupRow
            key={i}
            group={g}
            source={source}
            onRestore={() => {
              onRestore(g.symbols);
              toast.info(`Restored "${g.name}" — ${g.symbols.length} symbol${g.symbols.length === 1 ? '' : 's'} selected.`);
            }}
            onDelete={() => {
              setSavedGroups(savedGroups.filter((_, j) => j !== i));
              toast.success(`Deleted "${g.name}".`);
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SavedGroupRow({
  group,
  source,
  onRestore,
  onDelete
}: {
  group: SavedGroup;
  source: 'rankings' | 'discover';
  onRestore: () => void;
  onDelete: () => void;
}) {
  const tag = group.source && group.source !== source ? `(from ${group.source})` : '';
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{group.name}</div>
          <div className="text-xs text-muted-foreground">
            {group.symbols.length} symbol{group.symbols.length === 1 ? '' : 's'}
            {tag && ` · ${tag}`}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Restore selection" onClick={onRestore}>
            <ListChecks className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            aria-label="Download as text"
            onClick={() => downloadFile(`${group.name}.txt`, group.symbols.join('\n'))}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" aria-label="Delete group" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
