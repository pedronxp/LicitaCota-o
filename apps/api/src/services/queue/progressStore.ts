// Progresso em memória para pesquisas processadas sem Redis (instância única).
const store = new Map<string, Record<string, unknown>>();

export const progressStore = {
  set(id: string, data: Record<string, unknown>): void {
    store.set(id, data);
  },
  get(id: string): Record<string, unknown> | null {
    return store.get(id) ?? null;
  },
  del(id: string): void {
    store.delete(id);
  },
};
