import {NavLink} from 'react-router';
import type {IconName} from '../icons';
import type {Key} from '../i18n/strings';
import {useI18n} from '../i18n/I18n';
import {Icon} from './Icon';

const TABS: {to: string; icon: IconName; label: Key}[] = [
  {to: '/', icon: 'hourglass', label: 'tabApprovals'},
  {to: '/kids', icon: 'kids', label: 'tabKids'},
  {to: '/jobs', icon: 'list', label: 'tabJobs'},
  {to: '/tvs', icon: 'tv', label: 'tabTvs'},
  {to: '/settings', icon: 'sliders', label: 'tabSettings'},
];

export function TabBar() {
  const {t} = useI18n();
  return (
    <nav className="tabbar">
      {TABS.map(tab => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className="tab">
          <Icon name={tab.icon} size={26} />
          <span>{t(tab.label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
