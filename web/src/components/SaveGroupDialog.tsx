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
import { Copy } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbols: string[];
  defaultName: string;
  onSave: (name: string, symbols: string[]) => void;
}

export function SaveGroupDialog({ open, onOpenChange, symbols, defaultName, onSave }: Props) {
  const [name, setName] = useState(defaultName);
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
                onClick={() => navigator.clipboard?.writeText(commaList)}
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
                onClick={() => navigator.clipboard?.writeText(lineList)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!name.trim() || symbols.length === 0}
            onClick={() => {
              onSave(name.trim(), symbols);
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
