import {ART, ICONS, type IconName} from '../icons';

// The SVG bodies are constant strings from icons.ts (never user content), so setting them as markup is safe.

/** A stroke icon from the TV's set (plus the phone's few extras), drawn in the current text colour. */
export function Icon({name, size = 24}: {name: IconName; size?: number}) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{__html: ICONS[name]}}
    />
  );
}

/** Multi-colour art: the kids' animals and the jar logo. */
export function Art({name, size}: {name: keyof typeof ART; size: number}) {
  const art = ART[name];
  return <svg width={size} height={size} viewBox={art.viewBox} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{__html: art.body}} />;
}
