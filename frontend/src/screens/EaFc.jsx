import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, CheckCircle } from '@phosphor-icons/react';
import { StatusDot } from '../components/ui.jsx';
import GuardianSheet from '../components/GuardianSheet.jsx';
import { useGuardian } from '../state/GuardianContext.jsx';
import { SBC, SOLUTION } from '../mock/data.js';

function EaMock({ applied, submitted }) {
  const slots = SOLUTION.players;
  return (
    <div className="pointer-events-none flex h-full flex-col px-5 pb-28 pt-5 opacity-90">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-600">Squad Building Challenge</span>
        <span className="rounded-md border border-zinc-800 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-zinc-600">mock</span>
      </div>
      <h2 className="font-display text-lg font-semibold text-zinc-300">{SBC.name}</h2>
      <p className="mt-0.5 text-[12.5px] text-zinc-600">{SBC.group} · Reward: {SBC.reward}</p>

      <div className="mt-3 flex gap-2">
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5 text-[11.5px] text-zinc-500">
          Min. Rating <span className="text-zinc-300">83</span>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5 text-[11.5px] text-zinc-500">
          Players <span className="text-zinc-300">11</span>
        </div>
      </div>

      {submitted && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-jade/25 bg-jade/10 px-3 py-2 text-[13px] font-medium text-jade">
          <CheckCircle size={16} weight="fill" /> Challenge complete
        </div>
      )}

      <div className="relative mt-4 flex-1 overflow-hidden rounded-2xl border border-zinc-800/70 bg-[#0b100d]">
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 30%, rgba(16,80,50,0.35), transparent 65%), repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 32px, rgba(255,255,255,0.035) 32px 64px)',
          }}
        />
        <div className="absolute left-1/2 top-[38%] h-24 w-24 -translate-x-1/2 rounded-full border border-white/[0.06]" />
        <div className="absolute inset-x-0 top-[38%] h-px bg-white/[0.06]" />
        <div className="relative grid h-full grid-rows-4 px-3 py-4">
          {[slots.slice(9, 11), slots.slice(6, 9), slots.slice(1, 6), slots.slice(0, 1)].map((row, ri) => (
            <div key={ri} className="flex items-center justify-center gap-2">
              {row.map((p) => (
                <div
                  key={p.id}
                  className={`flex h-14 w-11 flex-col items-center justify-center rounded-lg border text-center transition-colors duration-500 ${
                    applied ? 'border-gold/30 bg-[#151208]' : 'border-dashed border-zinc-700/60 bg-zinc-900/30'
                  }`}
                >
                  {applied ? (
                    <>
                      <span className="font-display text-[13px] font-semibold text-gold">{p.rating}</span>
                      <span className="max-w-full truncate px-0.5 text-[7.5px] text-zinc-400">{p.name}</span>
                    </>
                  ) : (
                    <span className="text-[9px] text-zinc-700">{p.pos}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EaFc() {
  const { offline, scenario } = useGuardian();
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const pillStatus = offline ? 'offline' : applied && !submitted ? 'review' : 'ready';
  const pillLabel = offline ? 'Offline' : applied && !submitted ? 'Review' : 'Ready';

  return (
    <div className="relative h-full bg-[#08090a]">
      <EaMock applied={applied} submitted={submitted} />

      <AnimatePresence>
        {!open && (
          <motion.button
            data-testid="guardian-pill"
            aria-label="Open Guardian"
            initial={{ opacity: 0, y: 12, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 12, x: '-50%' }}
            onClick={() => setOpen(true)}
            className="tap absolute bottom-24 left-1/2 z-30 flex items-center gap-2.5 rounded-full border border-zinc-700/70 bg-zinc-900/80 py-2.5 pl-3.5 pr-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl"
          >
            <ShieldCheck size={19} weight="fill" className={offline ? 'text-zinc-500' : 'text-jade'} />
            <span className="text-[13.5px] font-semibold text-zinc-100">Guardian</span>
            <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
              <StatusDot status={pillStatus} />
              {pillLabel}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <GuardianSheet
        open={open}
        onClose={() => setOpen(false)}
        applied={applied}
        setApplied={setApplied}
        submitted={submitted}
        setSubmitted={setSubmitted}
      />
    </div>
  );
}
