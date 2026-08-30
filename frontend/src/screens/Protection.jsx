import { useState } from 'react';
import { CaretDown, Heart, UsersThree, CoinVertical, Sparkle, LockSimple } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Toggle, InfoDot } from '../components/ui.jsx';
import { useGuardian, PRESET_LABELS } from '../state/GuardianContext.jsx';

const PRESETS = [
  { id: 'relaxed', name: 'Relaxed', desc: 'Guardian only protects favorites, active squads and locked players.' },
  { id: 'recommended', name: 'Recommended', desc: 'Protects favorites, active squad players, valuable players and unusual special cards.', best: true },
  { id: 'verysafe', name: 'Very Safe', desc: 'Maximum protection. Guardian is extra cautious with anything valuable or special.' },
  { id: 'custom', name: 'Custom', desc: 'Choose exactly what Guardian protects.' },
];

const AUTO_ROWS = [
  { key: 'favorites', label: 'Favorites', Icon: Heart },
  { key: 'activeSquads', label: 'Active squads', Icon: UsersThree },
  { key: 'valuable', label: 'Valuable players', Icon: CoinVertical },
  { key: 'special', label: 'Special cards', Icon: Sparkle },
  { key: 'locked', label: 'Manually locked players', Icon: LockSimple },
];

export default function Protection() {
  const { preset, setPreset, toggles, setToggle, setInfo } = useGuardian();
  const [advOpen, setAdvOpen] = useState(false);
  const [threshold, setThreshold] = useState('50,000');
  const [prefUntrade, setPrefUntrade] = useState(true);
  const [prefDupes, setPrefDupes] = useState(true);

  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar px-5 pb-28 pt-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">Protection</h1>
      <p className="mt-1 text-[14px] text-zinc-500">How careful should Guardian be?</p>

      <div className="mt-4 space-y-2.5">
        {PRESETS.map((p) => {
          const selected = preset === p.id;
          return (
            <motion.button
              key={p.id}
              data-testid={`preset-${p.id}`}
              onClick={() => setPreset(p.id)}
              animate={{ borderColor: selected ? 'rgba(16,185,129,0.6)' : '#27272a' }}
              className={`tap w-full rounded-2xl border p-4 text-left ${selected ? 'bg-jade/5' : 'bg-surface'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`font-display text-[15px] font-semibold ${selected ? 'text-jade' : 'text-zinc-200'}`}>{p.name}</span>
                  {p.best && (
                    <span className="rounded-full bg-jade/15 px-2 py-0.5 text-[10.5px] font-semibold text-jade">Best default</span>
                  )}
                </div>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-jade' : 'border-zinc-600'}`}>
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-jade" />}
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{p.desc}</p>
            </motion.button>
          );
        })}
      </div>

      <p className="mb-2 mt-6 text-[13px] font-medium uppercase tracking-wider text-zinc-500">Protected automatically</p>
      <Card className="divide-y divide-brd !p-0">
        {AUTO_ROWS.map(({ key, label, Icon }) => (
          <div key={key} className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <Icon size={19} className="text-zinc-500" />
              <span className="text-[14px] text-zinc-200">{label}</span>
            </div>
            <Toggle
              testId={`toggle-${key}`}
              on={toggles[key]}
              onChange={(v) => setToggle(key, v)}
            />
          </div>
        ))}
      </Card>
      <p className="mt-2 px-1 text-[12px] text-zinc-600">Changing a switch moves you to the Custom preset.</p>

      <button
        data-testid="advanced-settings-toggle"
        onClick={() => setAdvOpen(!advOpen)}
        className="tap mt-5 flex w-full items-center justify-between rounded-2xl border border-brd bg-surface px-4 py-3.5"
      >
        <span className="text-[14px] font-medium text-zinc-300">Advanced settings</span>
        <CaretDown size={17} className={`text-zinc-500 transition-transform duration-200 ${advOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {advOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
            data-testid="advanced-settings-panel"
          >
            <Card className="mt-2.5 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-zinc-200">Protect expensive players</span>
                  <Toggle testId="toggle-expensive" on={toggles.valuable} onChange={(v) => setToggle('valuable', v)} />
                </div>
                <p className="mt-1 text-[13px] text-zinc-500">Players worth more than</p>
                <select
                  data-testid="threshold-select"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-brd bg-elev px-3 py-2.5 text-[14px] text-zinc-200"
                >
                  {['25,000', '50,000', '100,000', '250,000'].map((v) => (
                    <option key={v}>{v} coins</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[12.5px] text-zinc-600">will never be used automatically.</p>
              </div>

              <div className="border-t border-brd pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-zinc-200">Prefer untradeable players</span>
                    <InfoDot testId="info-prefer-untradeables" onClick={() => setInfo({ type: 'preferUntradeables' })} />
                  </div>
                  <Toggle testId="toggle-prefer-untradeables" on={prefUntrade} onChange={setPrefUntrade} />
                </div>
              </div>

              <div className="border-t border-brd pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-zinc-200">Prefer duplicates</span>
                    <InfoDot testId="info-prefer-duplicates" onClick={() => setInfo({ type: 'preferDuplicates' })} />
                  </div>
                  <Toggle testId="toggle-prefer-duplicates" on={prefDupes} onChange={setPrefDupes} />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-brd pt-4">
                <span className="text-[14px] font-medium text-zinc-200">Manually locked players</span>
                <span className="text-[13px] text-zinc-500">12 locked</span>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
