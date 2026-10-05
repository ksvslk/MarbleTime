import type {ReactNode} from 'react';
import {Link} from 'react-router';
import type {IconName} from '../icons';
import {useI18n} from '../i18n/I18n';
import {Art, Icon} from './Icon';

/** A screen: a big title (with a way back on inner screens), an optional action, then the content. */
export function Page({title, back, action, children}: {title: string; back?: string; action?: ReactNode; children: ReactNode}) {
  const {t} = useI18n();
  return (
    <main className="page">
      <header className="page-header">
        {back ? (
          <Link className="btn-round btn-glass" to={back} aria-label={t('back')}>
            <Icon name="back" />
          </Link>
        ) : null}
        <h1>{title}</h1>
        {action}
      </header>
      {children}
    </main>
  );
}

/** While the first data loads: just the jar. */
export function Splash() {
  return (
    <main className="center-screen" aria-busy="true">
      <span className="splash-logo">
        <Art name="logo" size={88} />
      </span>
    </main>
  );
}

export function Empty({icon, title, hint, children}: {icon: IconName; title: string; hint?: string; children?: ReactNode}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={40} />
      </span>
      <p className="empty-title">{title}</p>
      {hint ? <p className="muted">{hint}</p> : null}
      {children}
    </div>
  );
}

export function NotFound({back}: {back: string}) {
  const {t} = useI18n();
  return (
    <Page title={t('notFound')} back={back}>
      <Empty icon="star" title={t('notFound')} />
    </Page>
  );
}
