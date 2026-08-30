import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, CheckCircle } from '@phosphor-icons/react';
import { Btn } from '../components/ui.jsx';
import { useGuardian } from '../state/GuardianContext.jsx';

const PRESETS = [
  { id: 'recommended', name: 'Recommended', tag: 'Best for most players', desc: 'Protects valuable and important players.' },
  { id: 'verysafe', name: 'Extra Safe', tag: 'For carefully managed clubs', desc: 'Protects more special and high-value players.' },
  { id: 'custom', name: 'Custom', tag: 'Full control', desc: 'Choose exactly what Guardian protects.' },
];

export default function Onboarding() {
  const { completeOnboarding, setPreset, setTab } = useGuardian();
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState('recommended');

  const finish = (goEafc) => {
    setPreset(choice);
    completeOnboarding();
    if (goEafc) setTab('eafc');
  };

  return (
    <div className="flex h-full flex-col px-6 pb-10 pt-14">
      <div className="mb-8 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-jade' : 'bg-zinc-800'}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" className="flex flex-1 flex-col" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
            <div className="flex flex-1 flex-col items-start justify-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-jade/10 ring-1 ring-jade/30">
                <ShieldCheck size={34} weight="fill" className="text-jade" />
              </div>
              <h1 className="font-display text-[26px] font-semibold leading-tight">Welcome to<br />SBC Guardian</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">Protect your club. Build SBCs faster.</p>
            </div>
            <Btn data-testid="onboarding-continue-btn" onClick={() => setStep(1)}>Continue</Btn>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" className="flex flex-1 flex-col" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
            <h1 className="font-display text-[22px] font-semibold leading-tight">Let's protect your club.</h1>
            <p className="mt-2 text-[14px] text-zinc-500">Choose how Guardian should protect your players.</p>
            <div className="mt-6 flex-1 space-y-3">
              {PRESETS.map((p) => {
                const sel = choice === p.id;
                return (
                  <motion.button
                    key={p.id}
                    data-testid={`onboarding-preset-${p.id}`}
                    onClick={() => setChoice(p.id)}
                    animate={{ borderColor: sel ? 'rgba(16,185,129,0.6)' : '#27272a' }}
                    className={`tap w-full rounded-2xl border p-4 text-left ${sel ? 'bg-jade/5' : 'bg-surface'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-display text-[16px] font-semibold ${sel ? 'text-jade' : 'text-zinc-100'}`}>{p.name}</span>
                      {sel && <CheckCircle size={20} weight="fill" className="text-jade" />}
                    </div>
                    <p className="mt-0.5 text-[12.5px] font-medium text-zinc-500">{p.tag}</p>
                    <p className="mt-1.5 text-[13px] text-zinc-500">{p.desc}</p>
                  </motion.button>
                );
              })}
            </div>
            <Btn data-testid="onboarding-use-preset-btn" onClick={() => setStep(2)}>
              {choice === 'recommended' ? 'Use Recommended' : 'Continue'}
            </Btn>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" className="flex flex-1 flex-col" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
            <div className="flex flex-1 flex-col items-start justify-center">
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', damping: 16 }}
                className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-jade/10 ring-1 ring-jade/30"
              >
                <CheckCircle size={34} weight="fill" className="text-jade" />
              </motion.div>
              <h1 className="font-display text-[24px] font-semibold">Ready</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
                Guardian is configured.<br /><br />
                Open EA FC and Guardian will appear when you view an SBC.
              </p>
            </div>
            <div className="space-y-2.5">
              <Btn data-testid="onboarding-open-eafc-btn" onClick={() => finish(true)}>Open EA FC</Btn>
              <Btn variant="ghost" data-testid="onboarding-skip-btn" onClick={() => finish(false)}>Go to Home</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
