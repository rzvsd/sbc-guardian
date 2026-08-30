import { Info, ShieldCheck, Warning } from '@phosphor-icons/react';
import { Sheet, Btn } from './ui.jsx';
import { useGuardian } from '../state/GuardianContext.jsx';

const STATIC_INFO = {
  findSolution: {
    icon: 'info',
    title: 'Find Solution',
    body: 'Guardian checks eligible players in your club and finds a squad that meets the SBC requirements while respecting your protection settings.\n\nNothing is changed in EA FC yet.',
  },
  applySquad: {
    icon: 'info',
    title: 'Apply Squad',
    body: "Places Guardian's selected players into the current SBC squad.\n\nThis does not submit the SBC. You can review everything first.",
  },
  submitSbc: {
    icon: 'info',
    title: 'Submit SBC',
    body: 'Submits the completed squad to EA FC and consumes the submitted players.\n\nThis action normally cannot be undone.',
  },
  preferUntradeables: {
    icon: 'info',
    title: 'Prefer untradeable players',
    body: 'Guardian will prefer suitable untradeable players when this avoids sacrificing tradeable players.',
  },
  preferDuplicates: {
    icon: 'info',
    title: 'Prefer duplicates',
    body: 'Guardian will use duplicate cards first, since keeping two copies of the same player rarely adds value to your club.',
  },
  sacrificeValue: {
    icon: 'info',
    title: 'Estimated sacrifice value',
    body: 'The approximate market value of all tradeable players in this solution.\n\nUntradeable and duplicate players are not counted, since they cannot be sold anyway.',
  },
  tryAnother: {
    icon: 'info',
    title: 'Try Another Solution',
    body: 'Guardian searches for a different squad using other eligible players. Your protection settings still apply.',
  },
};

export default function InfoSheet() {
  const { info, setInfo, setTab } = useGuardian();

  let content = null;
  if (info) {
    if (info.type === 'protected') {
      content = {
        icon: 'shield',
        title: 'Protected by Guardian',
        body: info.payload.detail,
        action: info.payload.kind !== 'squad' ? { label: 'Change protection settings', onClick: () => { setInfo(null); setTab('protection'); } } : null,
      };
    } else if (info.type === 'risk') {
      content = {
        icon: 'warning',
        title: 'Special card in this squad',
        body: `${info.payload.name} (${info.payload.rating} ${info.payload.type}) is worth approximately ${info.payload.value.toLocaleString()} coins.\n\nGuardian recommends reviewing this player before submission.`,
      };
    } else if (info.type === 'whyPlayer') {
      content = {
        icon: 'shield',
        title: `Why ${info.payload.name}?`,
        list: info.payload.reasons,
      };
    } else {
      content = STATIC_INFO[info.type];
    }
  }

  const icons = {
    info: <Info size={26} className="text-jade" weight="regular" />,
    shield: <ShieldCheck size={26} className="text-jade" weight="fill" />,
    warning: <Warning size={26} className="text-amber-400" weight="fill" />,
  };

  return (
    <Sheet open={!!info} onClose={() => setInfo(null)} testId="info-sheet">
      {content && (
        <div className="px-5 pt-1">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-elev">{icons[content.icon]}</div>
          <h3 className="font-display text-lg font-semibold text-zinc-100">{content.title}</h3>
          {content.body && (
            <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-zinc-400">{content.body}</p>
          )}
          {content.list && (
            <ul className="mt-3 space-y-2">
              {content.list.map((r, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[14px] text-zinc-300">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-jade" />
                  {r}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 space-y-2">
            {content.action && (
              <Btn variant="secondary" data-testid="info-sheet-action-btn" onClick={content.action.onClick}>
                {content.action.label}
              </Btn>
            )}
            <Btn variant="ghost" data-testid="info-sheet-close-btn" onClick={() => setInfo(null)}>
              Got it
            </Btn>
          </div>
        </div>
      )}
    </Sheet>
  );
}
