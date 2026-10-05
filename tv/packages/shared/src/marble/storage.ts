/**
 * Where the TV keeps its state between launches (one JSON string). This default only keeps it in
 * memory; storage.android.ts (Fire OS) and storage.kepler.ts (Vega) save it on the device.
 */
let memory: string | null = null;

export const Storage = {
  load: async (): Promise<string | null> => memory,
  save: async (value: string): Promise<void> => {
    memory = value;
  },
};
