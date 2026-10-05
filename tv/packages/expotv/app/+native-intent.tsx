// MarbleTime handles its own test/demo links (marbletime://open?...), so keep Expo Router on the single index route.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return path.includes('open') ? '/' : path;
}
