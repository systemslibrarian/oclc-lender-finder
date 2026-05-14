import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Download } from 'lucide-react';
import { useToast } from '@/components/Toast';

function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbols: string[];
  defaultName: string;
  onSave: (name: string, symbols: string[]) => void;
}

export function SaveGroupDialog({ open, onOpenChange, symbols, defaultName, onSave }: Props) {
  const [name, setName] = useState(defaultName);
  const toast = useToast();
  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  const commaList = symbols.join(', ');
  const lineList = symbols.join('\n');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Build holdings group</DialogTitle>
          <DialogDescription>
            {symbols.length} symbol{symbols.length === 1 ? '' : 's'} selected. Saved groups stay in this
            browser; copy or download the list below to paste into your custom holdings group in OCLC.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="group-name">Group name</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FL_FAST_LENDERS" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Comma list</Label>
            <div className="flex gap-2">
              <Textarea readOnly value={commaList} rows={3} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="Copy comma list"
                onClick={() => {
                  navigator.clipboard?.writeText(commaList);
                  toast.success('Comma list copied to clipboard.');
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">One per line</Label>
            <div className="flex gap-2">
              <Textarea readOnly value={lineList} rows={4} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="Copy line list"
                onClick={() => {
                  navigator.clipboard?.writeText(lineList);
                  toast.success('Line list copied to clipboard.');
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={!name.trim() || symbols.length === 0}
            onClick={() => {
              const safe = name.trim().replace(/[^A-Za-z0-9_-]/g, '_') || 'holdings-group';
              downloadFile(`${safe}.txt`, symbols.join('\n'));
              toast.success(`Downloaded ${safe}.txt`);
            }}
          >
            <Download className="mr-2 h-4 w-4" />Download .txt
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!name.trim() || symbols.length === 0}
            onClick={() => {
              onSave(name.trim(), symbols);
              toast.success(`Saved "${name.trim()}" — ${symbols.length} symbol${symbols.length === 1 ? '' : 's'}.`);
              onOpenChange(false);
            }}
          >
            Save group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
