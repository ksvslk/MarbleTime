import {useEffect} from 'react';
import {Link} from 'react-router';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {minutesFromSec} from '../lib/format';
import {Avatar} from '../ui/Avatar';
import {Icon} from '../ui/Icon';
import {TimeLabel} from '../ui/Marbles';
import {Empty, Page} from '../ui/Page';

/** Every kid with the time in their jar. */
export function Kids() {
  const {bundle, refresh} = useFamily();
  const {t} = useI18n();
  // Balances change on the TV (brain games, approvals there), so look again on every visit.
  useEffect(() => void refresh(), [refresh]);

  return (
    <Page
      title={t('tabKids')}
      action={
        <Link className="btn btn-glass btn-small" to="/kids/new">
          <Icon name="plus" size={20} />
          {t('addKid')}
        </Link>
      }>
      {bundle.children.length === 0 ? (
        <Empty icon="kids" title={t('noKids')} />
      ) : (
        <ul className="list">
          {bundle.children.map(child => (
            <li key={child.id}>
              <Link className="card row link-card" to={`/kids/${child.id}`}>
                <Avatar avatar={child.avatar} color={child.color} size={56} />
                <span className="grow">
                  <span className="row-title">{child.name}</span>
                  <TimeLabel minutes={minutesFromSec(child.balanceSec)} max={8} />
                </span>
                <Icon name="chevron" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
