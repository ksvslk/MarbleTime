/**
 * Where the TV keeps its state between launches (one JSON string). This default only keeps it in
 * memory; storage.android.ts (Fire OS) and storage.kepler.ts (Vega) save it on the device.
 */
let memory: string | null = null;
const items = new Map<string, string>();

export const Storage = {
  load: async (): Promise<string | null> => memory,
  save: async (value: string): Promise<void> => {
    memory = value;
  },
  /** Other things kept between launches, by key (characters' art). */
  get: async (key: string): Promise<string | null> => items.get(key) ?? null,
  set: async (key: string, value: string): Promise<void> => {
    items.set(key, value);
  },
};
