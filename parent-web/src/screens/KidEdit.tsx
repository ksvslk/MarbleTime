import {useState, type FormEvent} from 'react';
import {useNavigate, useParams} from 'react-router';
import {useApi} from '../api/ApiContext';
import type {Child} from '../api/types';
import {useFamily} from '../family';
import {useI18n} from '../i18n/I18n';
import {usesAmazonKids} from '../lib/handoff';
import {Confirm} from '../ui/Confirm';
import {Icon} from '../ui/Icon';
import {NotFound, Page} from '../ui/Page';
import {useShowError} from '../ui/Toast';
import {KidFields, kidDraftFrom, newKidDraft, type KidDraft} from './KidFields';

/** /kids/new and /kids/:id/edit: name, animal, colour, age and the daily budget; and removing a kid. */
export function KidEdit() {
  const {id} = useParams();
  const {bundle} = useFamily();
  const existing = id ? bundle.children.find(child => child.id === id) : undefined;
  if (id && !existing) return <NotFound back="/kids" />;
  return <KidForm key={id ?? 'new'} existing={existing} />;
}

function KidForm({existing}: {existing?: Child}) {
  const api = useApi();
  const {bundle, update, refresh} = useFamily();
  const {t} = useI18n();
  const navigate = useNavigate();
  const showError = useShowError();
  const [kid, setKid] = useState<KidDraft>(() => (existing ? kidDraftFrom(existing) : newKidDraft(bundle.children)));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const name = kid.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      const saved = existing ? await api.patchChild(existing.id, {...kid, name}) : await api.addChild({...kid, name});
      update(b => ({...b, children: existing ? b.children.map(c => (c.id === saved.id ? saved : c)) : [...b.children, saved]}));
      navigate(`/kids/${saved.id}`, {replace: true});
    } catch (error) {
      showError(error);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await api.removeChild(existing.id);
      update(b => ({...b, children: b.children.filter(c => c.id !== existing.id)}));
      void refresh(); // the kid's jobs changed on the server too
      navigate('/kids', {replace: true});
    } catch (error) {
      showError(error);
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Page title={existing ? existing.name : t('newKid')} back={existing ? `/kids/${existing.id}` : '/kids'}>
      <form className="card form" onSubmit={save}>
        <KidFields value={kid} amazonKids={usesAmazonKids(bundle.devices)} isNew={!existing} onChange={setKid} />
        <button className="btn btn-gold btn-block" disabled={busy || !kid.name.trim()}>
          {t('save')}
        </button>
      </form>
      {existing ? (
        <>
          <button type="button" className="btn btn-glass btn-block" onClick={() => setConfirming(true)}>
            <Icon name="trash" />
            {t('remove')}
          </button>
          <Confirm
            open={confirming}
            title={t('removeKidQ', {kid: existing.name})}
            text={t('removeKidHint')}
            confirmLabel={t('remove')}
            busy={busy}
            onConfirm={() => void remove()}
            onCancel={() => setConfirming(false)}
          />
        </>
      ) : null}
    </Page>
  );
}
