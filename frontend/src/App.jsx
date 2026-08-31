import { AnimatePresence, motion } from 'framer-motion';
import { GuardianProvider, useGuardian } from './state/GuardianContext.jsx';
import BottomNav from './components/BottomNav.jsx';
import InfoSheet from './components/InfoSheet.jsx';
import Home from './screens/Home.jsx';
import EaFc from './screens/EaFc.jsx';
import Protection from './screens/Protection.jsx';
import Profile from './screens/Profile.jsx';
import Onboarding from './screens/Onboarding.jsx';

const SCREENS = { home: Home, eafc: EaFc, protection: Protection, profile: Profile };

function Toast() {
  const { toast } = useGuardian();
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          data-testid="toast"
          initial={{ opacity: 0, y: 14, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 14, x: '-50%' }}
          className="absolute bottom-36 left-1/2 z-[80] whitespace-nowrap rounded-full border border-brd bg-zinc-900/95 px-4 py-2.5 text-[13px] font-medium text-zinc-200 shadow-xl backdrop-blur"
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Shell() {
  const { tab, onboarded, production, runtimeAdapter } = useGuardian();
  if (production && !runtimeAdapter) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-ink p-6 text-center text-sm text-zinc-300" data-testid="runtime-unavailable">
        Guardian is unavailable until the secure runtime connection is ready.
      </div>
    );
  }
  const Screen = SCREENS[tab];

  return (
    <div className="mx-auto h-[100dvh] max-w-md" data-testid="app-shell">
      <div className="relative h-full overflow-hidden bg-ink font-body text-zinc-50 sm:rounded-none">
        {!onboarded ? (
          <Onboarding />
        ) : (
          <>
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                <Screen />
              </motion.div>
            </AnimatePresence>
            <BottomNav />
          </>
        )}
        <InfoSheet />
        <Toast />
      </div>
    </div>
  );
}

export default function App({ runtimeAdapter = null, production = false }) {
  return (
    <GuardianProvider runtimeAdapter={runtimeAdapter} production={production}>
      <Shell />
    </GuardianProvider>
  );
}
