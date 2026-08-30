import { CaretRight, DeviceMobile, ShieldCheck, SignOut } from '@phosphor-icons/react';
import { Card, StatusDot } from '../components/ui.jsx';
import { useGuardian, PRESET_LABELS } from '../state/GuardianContext.jsx';

const SCENARIOS = [
  { id: 'normal', label: 'Normal — solution found' },
  { id: 'noSolution', label: 'No safe solution' },
  { id: 'clubChanged', label: 'Club changed — refresh needed' },
  { id: 'connectionError', label: 'Connection error during solve' },
  { id: 'offline', label: 'Guardian offline' },
];

export default function Profile() {
  const { offline, preset, scenario, setScenario, resetOnboarding, showToast } = useGuardian();

  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar px-5 pb-28 pt-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">Profile</h1>

      <Card className="mt-4 flex items-center gap-3.5" data-testid="profile-account-card">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-jade/15 font-display text-lg font-semibold text-jade">R</div>
        <div>
          <p className="font-display text-[15px] font-semibold text-zinc-100">Razvan</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-zinc-500">
            <StatusDot status={offline ? 'offline' : 'ready'} />
            {offline ? 'Disconnected' : 'Connected'}
          </div>
        </div>
      </Card>

      <Card className="mt-3 divide-y divide-brd !p-0">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <ShieldCheck size={19} weight="fill" className="text-jade" />
            <span className="text-[14px] text-zinc-200">Subscription</span>
          </div>
          <span className="text-[13px] font-medium text-jade">Guardian Premium</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <DeviceMobile size={19} className="text-zinc-500" />
            <span className="text-[14px] text-zinc-200">Devices</span>
          </div>
          <span className="text-[13px] text-zinc-500">Android linked</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-[14px] text-zinc-200">Protection level</span>
          <span className="text-[13px] text-zinc-500">{PRESET_LABELS[preset]}</span>
        </div>
      </Card>

      <p className="mb-2 mt-6 text-[13px] font-medium uppercase tracking-wider text-zinc-500">App</p>
      <Card className="divide-y divide-brd !p-0">
        {[['Version', '1.0.0 (prototype)'], ['Privacy', null], ['Terms', null], ['Help', null]].map(([label, val]) => (
          <button
            key={label}
            data-testid={`profile-row-${label.toLowerCase()}`}
            onClick={() => !val && showToast(`${label} — coming soon`)}
            className="tap flex w-full items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="text-[14px] text-zinc-200">{label}</span>
            {val ? <span className="text-[13px] text-zinc-500">{val}</span> : <CaretRight size={16} className="text-zinc-600" />}
          </button>
        ))}
      </Card>

      <p className="mb-2 mt-6 text-[13px] font-medium uppercase tracking-wider text-zinc-500">Prototype scenarios</p>
      <Card className="divide-y divide-brd !p-0" data-testid="demo-scenarios-card">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            data-testid={`scenario-${s.id}`}
            onClick={() => { setScenario(s.id); showToast(`Scenario: ${s.label}`); }}
            className="tap flex w-full items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="text-[14px] text-zinc-300">{s.label}</span>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${scenario === s.id ? 'border-jade' : 'border-zinc-700'}`}>
              {scenario === s.id && <span className="h-2.5 w-2.5 rounded-full bg-jade" />}
            </span>
          </button>
        ))}
      </Card>
      <p className="mt-2 px-1 text-[12px] text-zinc-600">Use these to preview every Guardian state in the EA FC tab.</p>

      <button
        data-testid="sign-out-btn"
        onClick={resetOnboarding}
        className="tap mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-brd bg-surface py-3.5 text-[14px] font-medium text-zinc-400"
      >
        <SignOut size={17} />
        Sign out
      </button>
    </div>
  );
}
