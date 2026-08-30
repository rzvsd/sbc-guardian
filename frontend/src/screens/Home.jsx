import { CheckCircle, CaretRight, ShieldCheck } from '@phosphor-icons/react';
import { Card, StatusDot, Btn } from '../components/ui.jsx';
import { useGuardian } from '../state/GuardianContext.jsx';
import { CLUB } from '../mock/data.js';

export default function Home() {
  const { setTab, offline, activity, setScenario, showToast } = useGuardian();

  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar px-5 pb-28 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={24} weight="fill" className="text-jade" />
          <h1 className="font-display text-xl font-semibold tracking-tight">SBC Guardian</h1>
        </div>
        <div data-testid="home-status-pill" className="flex items-center gap-2 rounded-full border border-brd bg-surface px-3 py-1.5 text-xs font-medium text-zinc-300">
          <StatusDot status={offline ? 'offline' : 'ready'} />
          {offline ? 'Offline' : 'Ready'}
        </div>
      </header>

      {offline && (
        <Card data-testid="home-offline-card" className="mb-4 border-zinc-700 bg-elev">
          <p className="font-display text-[15px] font-semibold text-zinc-200">Guardian is offline</p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            EA FC can still be viewed, but Guardian actions are temporarily unavailable.
          </p>
          <Btn
            variant="secondary"
            className="mt-3 !h-11 !min-h-[44px]"
            data-testid="home-reconnect-btn"
            onClick={() => { setScenario('normal'); showToast('Guardian reconnected'); }}
          >
            Reconnect
          </Btn>
        </Card>
      )}

      <section className="mb-4">
        <p className="mb-2 text-[13px] font-medium uppercase tracking-wider text-zinc-500">Your Club</p>
        <Card data-testid="home-club-card">
          <p className="font-display text-2xl font-semibold text-zinc-100">
            {CLUB.players.toLocaleString()} <span className="text-base font-normal text-zinc-400">players</span>
          </p>
          <p className="mt-0.5 text-[13px] text-zinc-500">Last synced: {CLUB.lastSynced}</p>
          <Btn className="mt-4" data-testid="home-continue-eafc-btn" onClick={() => setTab('eafc')}>
            Continue in EA FC →
          </Btn>
        </Card>
      </section>

      <section className="mb-4">
        <p className="mb-2 text-[13px] font-medium uppercase tracking-wider text-zinc-500">Protection</p>
        <Card data-testid="home-protection-card" className="cursor-pointer" onClick={() => setTab('protection')}>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              {['Valuable cards protected', 'Favorites protected', 'Active squads protected'].map((t) => (
                <div key={t} className="flex items-center gap-2 text-[14px] text-zinc-300">
                  <CheckCircle size={17} weight="fill" className="text-jade" />
                  {t}
                </div>
              ))}
            </div>
            <CaretRight size={18} className="text-zinc-600" />
          </div>
        </Card>
      </section>

      <section>
        <p className="mb-2 text-[13px] font-medium uppercase tracking-wider text-zinc-500">Recent activity</p>
        <Card data-testid="home-activity-card" className="divide-y divide-brd !p-0">
          {activity.length === 0 && (
            <div className="p-5 text-center">
              <p className="text-[14px] text-zinc-400">No recent SBCs</p>
              <p className="mt-1 text-[12.5px] text-zinc-600">Complete an SBC with Guardian and it will appear here.</p>
            </div>
          )}
          {activity.map((a, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3.5">
              <span className="text-[14px] text-zinc-200">{a.name}</span>
              <span className={`text-[13px] font-medium ${a.done ? 'text-jade' : 'text-zinc-500'}`}>{a.status}</span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
