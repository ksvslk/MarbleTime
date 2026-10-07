import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'marbletime.state';

/** Fire OS: the app's state survives restarts (AsyncStorage, the app's private storage). */
export const Storage = {
  load: (): Promise<string | null> => AsyncStorage.getItem(KEY),
  save: (value: string): Promise<void> => AsyncStorage.setItem(KEY, value),
  get: (key: string): Promise<string | null> => AsyncStorage.getItem(`marbletime.${key}`),
  set: (key: string, value: string): Promise<void> => AsyncStorage.setItem(`marbletime.${key}`, value),
};
