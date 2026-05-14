import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload } from 'lucide-react';
import { useAppState } from '@/app-state/AppContext';
import { parseDirectoryCSV } from '@/lib/parsing';
import type { DirectoryEntry } from '@/lib/types';
import { useToast } from '@/components/Toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TEMPLATE = 'symbol,name,state,type,groups,lat,lng\nFUG,University of Florida,FL,Academic,ASERL;ARL,29.6516,-82.3248\n';

export function ImportDirectoryDialog({ open, onOpenChange }: Props) {
  const { importedDirectory, setImportedDirectory } = useAppState();
  const toast = useToast();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const t = await file.text();
    setText(t);
  };

  const onImport = () => {
    setError(null);
    setCount(null);
    try {
      const rows = parseDirectoryCSV(text);
      if (rows.length === 0) {
        setError('No valid rows found.');
        return;
      }
      // Merge: imported entries override matching bundled, but here we just
      // dedupe by symbol against the existing import set.
      const bySym = new Map<string, DirectoryEntry>(importedDirectory.map((e) => [e.symbol, e]));
      rows.forEach((r) => bySym.set(r.symbol, r));
      setImportedDirectory(Array.from(bySym.values()));
      setCount(rows.length);
      toast.success(`Imported ${rows.length} director${rows.length === 1 ? 'y row' : 'y rows'}.`);
      setTimeout(() => {
        onOpenChange(false);
        setText('');
        setCount(null);
      }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import directory CSV</DialogTitle>
          <DialogDescription>
            Adds your own lender directory entries on top of the bundled
            directory + group rosters. Imported rows override bundled ones
            with the same symbol.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Required columns: <code>symbol</code>, <code>name</code>. Optional:{' '}
            <code>state</code>, <code>type</code>, <code>groups</code> (separated by ; or |),{' '}
            <code>lat</code>, <code>lng</code>.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload .csv file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <div>
            <p className="mb-1 text-xs text-muted-foreground">…or paste CSV here:</p>
            <Textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={TEMPLATE}
              className="font-mono text-xs"
              aria-label="Directory CSV"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {count != null && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Imported {count} row{count === 1 ? '' : 's'}. Closing…
            </p>
          )}
          {importedDirectory.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{importedDirectory.length} imported row{importedDirectory.length === 1 ? '' : 's'} loaded.</span>
              <button
                type="button"
                className="text-destructive hover:underline"
                onClick={() => setImportedDirectory([])}
              >
                Clear imported directory
              </button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onImport} disabled={!text.trim()}>Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
