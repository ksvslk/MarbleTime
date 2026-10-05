import type {IconPicker} from '../icons';
import type {Repo} from './repo';

/** What the domain needs from outside; tests pass a memory repo and a clock they control. */
export interface Deps {
  repo: Repo;
  now: () => number;
  /** The parent app's address; a TV's pairing QR code links to `${pwaUrl}/pair/<code>`. */
  pwaUrl: string;
  pickIcon: IconPicker;
}
