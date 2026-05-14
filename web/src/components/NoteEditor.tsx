import { useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAppState } from '@/app-state/AppContext';

interface Props {
  symbol: string;
  onClose?: () => void;
}

export function NoteEditor({ symbol, onClose }: Props) {
  const { notes, setNote } = useAppState();
  const [draft, setDraft] = useState(notes[symbol] || '');

  // Sync when symbol changes (e.g., when reused).
  useEffect(() => {
    setDraft(notes[symbol] || '');
  }, [symbol, notes]);

  return (
    <div className="mt-3 space-y-2 rounded-md border bg-muted/40 p-3">
      <Textarea
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={`Notes about ${symbol} — only visible to you.`}
        aria-label={`Notes for ${symbol}`}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            setNote(symbol, draft);
            onClose?.();
          }}
        >
          Save note
        </Button>
        {notes[symbol] && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setNote(symbol, '');
              setDraft('');
            }}
          >
            Delete
          </Button>
        )}
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        )}
      </div>
    </div>
  );
}
