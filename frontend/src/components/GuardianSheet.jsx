import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, CheckCircle, Warning, WifiSlash, ArrowsClockwise, CaretLeft, Circle,
} from '@phosphor-icons/react';
import { Sheet, Btn, Dialog, InfoDot, RatingTile } from './ui.jsx';
import { useGuardian, PRESET_LABELS } from '../state/GuardianContext.jsx';
import { SBC, SOLUTION, CLUB, coins } from '../mock/data.js';

const FIND_STEPS = ['Checking SBC requirements', 'Protecting important players', 'Comparing eligible cards', 'Building squad'];

function Finding({ onDone }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (idx >= FIND_STEPS.length) {
      const t = setTimeout(onDone, 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIdx(idx + 1), 700);
    return () => clearTimeout(t);
  }, [idx, onDone]);

  return (
    <div className="px-5 pb-2 pt-1" data-testid="finding-state">
      <h3 className="font-display text-lg font-semibold">Finding a safe solution…</h3>
      <div className="mt-4 space-y-3">
        {FIND_STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-3 text-[14px]">
            {i < idx ? (
              <CheckCircle size={19} weight="fill" className="text-jade" />
            ) : i === idx ? (
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="flex">
                <ArrowsClockwise size={19} className="text-jade" />
              </motion.span>
            ) : (
              <Circle size={19} className="text-zinc-700" />
            )}
            <span className={i <= idx ? 'text-zinc-200' : 'text-zinc-600'}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ p, onWhy, onRisk }) {
  return (
    <div data-testid={`player-row-${p.id}`} className="flex items-center gap-3 rounded-2xl border border-brd bg-surface p-3">
      <RatingTile rating={p.rating} special={p.special} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[14.5px] font-medium text-zinc-100">{p.name}</p>
          {p.special && <Warning size={14} weight="fill" className="shrink-0 text-amber-400" />}
        </div>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          {p.pos} · {p.type}
          {p.untradeable && ' · Untradeable'}
          {p.dupe && ' · Duplicate'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {p.special ? (
          <button data-testid={`player-risk-${p.id}`} onClick={onRisk} className="tap rounded-full bg-amber-400/10 px-2.5 py-1 text-[11.5px] font-medium text-amber-300">
            Review
          </button>
        ) : (
          <span className="text-[12px] text-zinc-600">~{coins(p.value)}</span>
        )}
        <InfoDot testId={`player-why-${p.id}`} onClick={onWhy} />
      </div>
    </div>
  );
}

export default function GuardianSheet({ open, onClose, applied, setApplied, submitted, setSubmitted }) {
  const { scenario, setScenario, offline, preset, setInfo, setTab, showToast, addActivity } = useGuardian();
  const [step, setStep] = useState('detected');
  const [confirming, setConfirming] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      if (offline) setStep('offline');
      else if (submitted) setStep('submitted');
      else if (applied) setStep('applied');
      else setStep(scenario === 'clubChanged' ? 'clubChanged' : 'detected');
    }
    wasOpen.current = open;
  }, [open, offline, applied, submitted, scenario]);

  const startFind = () => {
    if (scenario === 'clubChanged') { setStep('clubChanged'); return; }
    setStep('finding');
  };

  const onFindDone = () => {
    if (scenario === 'noSolution') setStep('noSolution');
    else if (scenario === 'connectionError') setStep('connectionError');
    else setStep('solution');
  };

  const doApply = () => {
    setApplied(true);
    setStep('applied');
    showToast('Squad applied — nothing submitted yet');
  };

  const doSubmit = () => {
    setConfirming(false);
    setSubmitted(true);
    setStep('submitted');
    addActivity({ name: SBC.name, status: 'Completed', done: true });
  };

  const refresh = () => {
    setStep('refreshing');
    setTimeout(() => {
      setScenario('normal');
      setStep('detected');
      showToast('Club refreshed');
    }, 1100);
  };

  const header = (
    <div className="mb-3 flex items-center justify-between px-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} weight="fill" className="text-jade" />
        <span className="font-display text-[14px] font-semibold text-zinc-200">SBC Guardian</span>
      </div>
      <span className="text-[12px] text-zinc-500">{PRESET_LABELS[preset]} protection</span>
    </div>
  );

  return (
    <>
      <Sheet open={open} onClose={onClose} testId="guardian-sheet">
        {header}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

            {step === 'detected' && (
              <div className="px-5 pt-1" data-testid="sbc-detected-state">
                <p className="text-[12px] font-medium uppercase tracking-wider text-jade">Challenge detected</p>
                <h3 className="mt-1 font-display text-xl font-semibold">{SBC.name}</h3>
                <div className="mt-4 space-y-2.5 rounded-2xl border border-brd bg-surface p-4 text-[14px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Club players available</span>
                    <span className="font-medium text-zinc-200">{CLUB.available}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Protection</span>
                    <span className="flex items-center gap-1.5 font-medium text-jade">
                      {PRESET_LABELS[preset]} <CheckCircle size={15} weight="fill" />
                    </span>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <Btn data-testid="find-solution-btn" onClick={startFind}>Find Solution</Btn>
                  <InfoDot testId="info-find-solution" onClick={() => setInfo({ type: 'findSolution' })} />
                </div>
                <p className="mt-3 text-center text-[12.5px] text-zinc-600">Nothing has been changed yet</p>
              </div>
            )}

            {step === 'finding' && <Finding onDone={onFindDone} />}

            {step === 'solution' && (
              <div className="px-5 pt-1" data-testid="solution-state">
                <div className="flex items-center gap-2">
                  <CheckCircle size={20} weight="fill" className="text-jade" />
                  <h3 className="font-display text-lg font-semibold">Guardian found a solution</h3>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-brd bg-surface p-3.5">
                    <p className="text-[12px] text-zinc-500">Rating</p>
                    <p className="mt-0.5 font-display text-xl font-semibold text-zinc-100">{SOLUTION.rating} <span className="text-jade">✓</span></p>
                  </div>
                  <div className="rounded-2xl border border-brd bg-surface p-3.5">
                    <p className="text-[12px] text-zinc-500">Chemistry</p>
                    <p className="mt-0.5 font-display text-xl font-semibold text-zinc-100">{SOLUTION.chemistry} <span className="text-jade">✓</span></p>
                  </div>
                </div>
                <div className="mt-2.5 rounded-2xl border border-brd bg-surface p-4">
                  <p className="text-[12px] text-zinc-500">Uses</p>
                  <div className="mt-2 space-y-1.5">
                    {SOLUTION.uses.map(([n, label]) => (
                      <div key={label} className="flex items-center gap-2 text-[14px] text-zinc-300">
                        <span className="w-5 font-display font-semibold text-zinc-100">{n}</span> {label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-brd pt-3">
                    <span className="flex items-center gap-1.5 text-[13px] text-zinc-500">
                      Estimated sacrifice value
                      <InfoDot testId="info-sacrifice" onClick={() => setInfo({ type: 'sacrificeValue' })} />
                    </span>
                    <span className="text-[14px] font-medium text-zinc-200">~{coins(SOLUTION.sacrifice)} coins</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-[13px] text-zinc-500">Protected players used</span>
                    <span className="flex items-center gap-1.5 text-[14px] font-medium text-jade">{SOLUTION.protectedUsed} <CheckCircle size={15} weight="fill" /></span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
                  <Warning size={16} weight="fill" className="shrink-0 text-amber-400" />
                  <p className="text-[13px] text-amber-200/90">Includes 1 special card — worth a quick look.</p>
                </div>
                <div className="mt-5 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <Btn data-testid="apply-squad-btn" onClick={doApply}>Apply Squad</Btn>
                    <InfoDot testId="info-apply-squad" onClick={() => setInfo({ type: 'applySquad' })} />
                  </div>
                  <Btn variant="secondary" data-testid="review-players-btn" onClick={() => setStep('review')}>Review Players</Btn>
                  <div className="flex items-center justify-center gap-1">
                    <button data-testid="try-another-btn" onClick={startFind} className="tap py-2 text-[13.5px] font-medium text-zinc-500">
                      Try Another Solution
                    </button>
                    <InfoDot testId="info-try-another" onClick={() => setInfo({ type: 'tryAnother' })} />
                  </div>
                </div>
              </div>
            )}

            {step === 'review' && (
              <div className="px-5 pt-1" data-testid="review-state">
                <button data-testid="review-back-btn" onClick={() => setStep(applied ? 'applied' : 'solution')} className="tap -ml-1 mb-2 flex items-center gap-1 py-1 text-[13.5px] font-medium text-zinc-400">
                  <CaretLeft size={15} /> Back
                </button>
                <h3 className="font-display text-lg font-semibold">Selected squad</h3>
                <p className="mt-0.5 text-[13px] text-zinc-500">Tap ⓘ on any player to see why Guardian chose them.</p>
                <div className="mt-3 space-y-2">
                  {SOLUTION.players.map((p) => (
                    <PlayerRow
                      key={p.id}
                      p={p}
                      onWhy={() => setInfo({ type: 'whyPlayer', payload: p })}
                      onRisk={() => setInfo({ type: 'risk', payload: p })}
                    />
                  ))}
                </div>
                <h4 className="mt-6 font-display text-[15px] font-semibold text-zinc-200">Guardian avoided these players</h4>
                <p className="mt-0.5 text-[13px] text-zinc-500">They stay safe in your club.</p>
                <div className="mt-3 space-y-2">
                  {SOLUTION.avoided.map((p) => (
                    <button
                      key={p.id}
                      data-testid={`avoided-row-${p.id}`}
                      onClick={() => setInfo({ type: 'protected', payload: p })}
                      className="tap flex w-full items-center gap-3 rounded-2xl border border-jade/15 bg-jade/[0.04] p-3 text-left"
                    >
                      <RatingTile rating={p.rating} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-medium text-zinc-100">{p.name}</p>
                        <p className="mt-0.5 text-[12px] text-zinc-500">{p.pos} · {p.type}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-jade/10 px-2.5 py-1 text-[11.5px] font-medium text-jade">
                        <ShieldCheck size={13} weight="fill" /> {p.reason}
                      </span>
                    </button>
                  ))}
                </div>
                {!applied && (
                  <div className="sticky bottom-0 mt-4 bg-gradient-to-t from-[#111113] via-[#111113] to-transparent pt-3">
                    <div className="flex items-center gap-3">
                      <Btn data-testid="review-apply-btn" onClick={doApply}>Apply Squad</Btn>
                      <InfoDot testId="info-apply-squad-review" onClick={() => setInfo({ type: 'applySquad' })} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'applied' && (
              <div className="px-5 pt-1" data-testid="applied-state">
                <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 15 }} className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-jade/10 ring-1 ring-jade/30">
                  <CheckCircle size={26} weight="fill" className="text-jade" />
                </motion.div>
                <h3 className="font-display text-lg font-semibold">Squad applied</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                  Review the players in EA FC before submitting.<br />
                  No players are consumed until you explicitly submit the SBC.
                </p>
                <div className="mt-5 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <Btn data-testid="review-submit-btn" onClick={() => setConfirming(true)}>Review &amp; Submit</Btn>
                    <InfoDot testId="info-submit" onClick={() => setInfo({ type: 'submitSbc' })} />
                  </div>
                  <Btn variant="secondary" data-testid="change-solution-btn" onClick={() => { setApplied(false); startFind(); }}>
                    Change Solution
                  </Btn>
                  <Btn variant="ghost" data-testid="applied-review-players-btn" onClick={() => setStep('review')}>
                    Review Players
                  </Btn>
                </div>
              </div>
            )}

            {step === 'submitted' && (
              <div className="px-5 pt-1 text-center" data-testid="submitted-state">
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 13 }} className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-jade/10 ring-1 ring-jade/30">
                  <CheckCircle size={34} weight="fill" className="text-jade" />
                </motion.div>
                <h3 className="font-display text-xl font-semibold">SBC submitted</h3>
                <p className="mt-2 text-[14px] text-zinc-400">
                  {SBC.name} is complete.<br />11 players were consumed. 0 protected players used.
                </p>
                <div className="mt-6 space-y-2.5">
                  <Btn data-testid="submitted-done-btn" onClick={onClose}>Done</Btn>
                  <Btn variant="ghost" data-testid="submitted-home-btn" onClick={() => { onClose(); setTab('home'); }}>
                    Back to Home
                  </Btn>
                </div>
              </div>
            )}

            {step === 'noSolution' && (
              <div className="px-5 pt-1" data-testid="no-solution-state">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10">
                  <Warning size={26} weight="fill" className="text-amber-400" />
                </div>
                <h3 className="font-display text-lg font-semibold">Guardian couldn't find a safe solution</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                  Your current protection settings exclude too many eligible players.
                </p>
                <div className="mt-5 space-y-2.5">
                  <Btn data-testid="no-solution-review-protection-btn" onClick={() => { onClose(); setTab('protection'); }}>
                    Review Protection
                  </Btn>
                  <Btn variant="secondary" data-testid="no-solution-try-again-btn" onClick={startFind}>Try Again</Btn>
                </div>
              </div>
            )}

            {step === 'connectionError' && (
              <div className="px-5 pt-1" data-testid="connection-error-state">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-elev">
                  <WifiSlash size={26} className="text-zinc-400" />
                </div>
                <h3 className="font-display text-lg font-semibold">Connection lost</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                  Guardian can't safely perform this action while disconnected. Nothing was changed in EA FC.
                </p>
                <div className="mt-5">
                  <Btn data-testid="connection-error-reconnect-btn" onClick={() => { setScenario('normal'); setStep('detected'); showToast('Guardian reconnected'); }}>
                    Reconnect
                  </Btn>
                </div>
              </div>
            )}

            {step === 'clubChanged' && (
              <div className="px-5 pt-1" data-testid="club-changed-state">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-elev">
                  <ArrowsClockwise size={26} className="text-jade" />
                </div>
                <h3 className="font-display text-lg font-semibold">Your club changed</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                  Guardian needs to refresh your club before creating a new solution.
                </p>
                <div className="mt-5">
                  <Btn data-testid="refresh-club-btn" onClick={refresh}>Refresh Club</Btn>
                </div>
              </div>
            )}

            {step === 'refreshing' && (
              <div className="flex flex-col items-center px-5 py-6" data-testid="refreshing-state">
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="flex">
                  <ArrowsClockwise size={28} className="text-jade" />
                </motion.span>
                <p className="mt-3 text-[14px] text-zinc-400">Refreshing your club…</p>
              </div>
            )}

            {step === 'offline' && (
              <div className="px-5 pt-1" data-testid="offline-state">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-elev">
                  <WifiSlash size={26} className="text-zinc-500" />
                </div>
                <h3 className="font-display text-lg font-semibold">Guardian is offline</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                  EA FC can still be viewed, but Guardian actions are temporarily unavailable.
                </p>
                <div className="mt-5">
                  <Btn data-testid="offline-reconnect-btn" onClick={() => { setScenario('normal'); setStep('detected'); showToast('Guardian reconnected'); }}>
                    Reconnect
                  </Btn>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Sheet>

      <Dialog open={confirming} testId="submit-confirm-dialog">
        <h3 className="font-display text-lg font-semibold">Submit this squad?</h3>
        <p className="mt-1 text-[14px] text-zinc-400">11 players will be consumed.</p>
        <div className="mt-4 space-y-2.5 rounded-2xl border border-brd bg-surface p-4 text-[14px]">
          <div className="flex justify-between">
            <span className="text-zinc-500">Estimated value</span>
            <span className="font-medium text-zinc-200">~{coins(SOLUTION.sacrifice)} coins</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Protected players</span>
            <span className="font-medium text-jade">0</span>
          </div>
          <button
            data-testid="confirm-special-row"
            onClick={() => setInfo({ type: 'risk', payload: SOLUTION.players.find((p) => p.special) })}
            className="tap flex w-full items-center justify-between"
          >
            <span className="flex items-center gap-1.5 text-amber-300">
              <Warning size={15} weight="fill" /> 1 special player
            </span>
            <span className="text-[12.5px] text-zinc-500">View</span>
          </button>
        </div>
        <p className="mt-3 text-[12.5px] text-zinc-500">This action normally cannot be undone.</p>
        <div className="mt-4 space-y-2.5">
          <Btn variant="danger" data-testid="confirm-submit-btn" onClick={doSubmit}>Submit Squad</Btn>
          <Btn variant="ghost" data-testid="cancel-submit-btn" onClick={() => setConfirming(false)}>Cancel</Btn>
        </div>
      </Dialog>
    </>
  );
}
