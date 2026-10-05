import {colorValues, type Color} from '../api/types';
import type {Key} from '../i18n/strings';
import {useI18n} from '../i18n/I18n';
import {CARD_COLORS} from '../tokens';
import {Icon} from './Icon';

const COLOR_NAMES: Record<Color, Key> = {peach: 'colorPeach', mint: 'colorMint', sky: 'colorSky', lilac: 'colorLilac', gold: 'colorGold'};

/** The five card and avatar colours of the TV design. */
export function ColorPicker({value, onChange}: {value: Color; onChange: (color: Color) => void}) {
  const {t} = useI18n();
  return (
    <div className="swatches">
      {colorValues.map(color => (
        <button
          key={color}
          type="button"
          className="swatch"
          style={{background: CARD_COLORS[color]}}
          aria-pressed={value === color}
          aria-label={t(COLOR_NAMES[color])}
          onClick={() => onChange(color)}>
          {value === color ? <Icon name="check" size={26} /> : null}
        </button>
      ))}
    </div>
  );
}
