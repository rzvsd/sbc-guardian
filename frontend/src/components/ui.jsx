import { motion, AnimatePresence } from 'framer-motion';
import { Info } from '@phosphor-icons/react';

export function Btn({ variant = 'primary', className = '', children, ...props }) {
  const styles = {
    primary: 'bg-jade text-ink font-semibold hover:bg-jade-deep',
    secondary: 'bg-elev text-zinc-100 border border-brd font-medium hover:bg-zinc-800',
    ghost: 'bg-transparent text-zinc-400 font-medium hover:text-zinc-200',
    danger: 'bg-red-600/90 text-white font-semibold hover:bg-red-600',
  };
  return (
    <button
      className={`tap h-13 min-h-[52px] w-full rounded-2xl px-5 text-[15px] transition-colors duration-150 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function InfoDot({ onClick, testId, className = '' }) {
  return (
    <button
      data-testid={testId}
      aria-label="More information"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`tap -m-2.5 p-2.5 text-zinc-500 hover:text-jade ${className}`}
    >
      <Info size={17} weight="regular" />
    </button>
  );
}

export function StatusDot({ status = 'ready', className = '' }) {
  const colors = { ready: 'bg-jade', review: 'bg-amber-400', risk: 'bg-red-500', offline: 'bg-zinc-500' };
  return <span className={`dot-live inline-block h-2 w-2 rounded-full ${colors[status]} ${className}`} />;
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-2xl border border-brd bg-surface p-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Toggle({ on, onChange, disabled, testId }) {
  return (
    <button
      data-testid={testId}
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange && onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
        on ? 'bg-jade' : 'bg-zinc-700'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
        style={{ left: 0 }}
      />
    </button>
  );
}

export function Sheet({ open, onClose, children, testId }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            data-testid={testId ? `${testId}-backdrop` : undefined}
          />
          <motion.div
            data-testid={testId}
            className="absolute inset-x-0 bottom-0 z-50 max-h-[88%] overflow-y-auto no-scrollbar rounded-t-3xl border-t border-brd bg-[#111113] pb-6"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          >
            <button
              aria-label="Close"
              data-testid={testId ? `${testId}-handle` : undefined}
              onClick={onClose}
              className="sticky top-0 z-10 flex w-full justify-center bg-[#111113] pt-3 pb-2"
            >
              <div className="h-1 w-10 rounded-full bg-zinc-700" />
            </button>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Dialog({ open, children, testId }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-[60] bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            data-testid={testId}
            className="absolute inset-x-4 top-1/2 z-[70] -translate-y-1/2 rounded-3xl border border-brd bg-[#141416] p-5"
            initial={{ opacity: 0, scale: 0.94, y: '-46%' }}
            animate={{ opacity: 1, scale: 1, y: '-50%' }}
            exit={{ opacity: 0, scale: 0.94, y: '-46%' }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function RatingTile({ rating, special }) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border font-display text-base font-semibold ${
        special
          ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
          : 'border-gold/25 bg-gold/10 text-gold'
      }`}
    >
      {rating}
    </div>
  );
}
