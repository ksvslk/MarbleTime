import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';

const KEY = 'marbletime.state';

/** Vega: the app's state survives restarts (Amazon's AsyncStorage port). */
export const Storage = {
  load: (): Promise<string | null> => AsyncStorage.getItem(KEY),
  save: (value: string): Promise<void> => AsyncStorage.setItem(KEY, value),
  get: (key: string): Promise<string | null> => AsyncStorage.getItem(`marbletime.${key}`),
  set: (key: string, value: string): Promise<void> => AsyncStorage.setItem(`marbletime.${key}`, value),
};
