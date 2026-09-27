import { useCallback, useState } from 'react';

interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

export function useToast() {
  const [items, setItems] = useState<Toast[]>([]);

  const notify = useCallback(
    (message: string, kind: Toast['kind'] = 'info') => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    [],
  );

  const host = (
    <div className="fixed top-space-md right-space-md flex flex-col gap-space-xs z-[100]">
      {items.map((t) => (
        <div
          key={t.id}
          className={`bg-surface-container-highest border border-outline-variant rounded-lg px-space-md py-space-sm max-w-[360px] font-body-sm text-body-sm text-on-surface ${t.kind === 'error' ? 'border-l-2 border-l-error' : t.kind === 'success' ? 'border-l-2 border-l-secondary' : ''}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );

  return { notify, host };
}
