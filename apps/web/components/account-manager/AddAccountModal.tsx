'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const PROVIDERS = [
  { id: 'chatgpt', label: 'ChatGPT (chatgpt.com)' },
  { id: 'gemini', label: 'Gemini (gemini.google.com)' },
  { id: 'claude', label: 'Claude (claude.ai)' },
  { id: 'flux', label: 'Flux (replicate.com)' },
  { id: 'dalle', label: 'DALL-E (chatgpt.com)' },
  { id: 'veo3', label: 'Veo 3 (labs.google/flow)' },
  { id: 'elevenlabs', label: 'ElevenLabs (elevenlabs.io)' },
];

export function AddAccountModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [provider, setProvider] = useState('chatgpt');
  const [label, setLabel] = useState('');
  const [cookiesJson, setCookiesJson] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const cookies = JSON.parse(cookiesJson);
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: provider, label: label || `${provider}-${Date.now()}`, cookies }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Lỗi tạo account');
        return;
      }
      setLabel('');
      setCookiesJson('');
      onCreated();
    } catch (e: any) {
      setError(`JSON không hợp lệ: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm account</DialogTitle>
          <DialogDescription>
            Paste cookies JSON từ Cookie-Editor extension. Cookies sẽ được mã hoá trước khi lưu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Provider</label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Label (vd: chatgpt-plus-1)</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cookies JSON</label>
            <Textarea
              value={cookiesJson}
              onChange={(e) => setCookiesJson(e.target.value)}
              placeholder='[{"name":"...", "value":"...", "domain":"...", "path":"/"}]'
              className="font-mono text-xs min-h-[200px]"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={submitting || !cookiesJson}>
            {submitting ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
