import { createContext, useContext, useState, useCallback, useRef } from 'react';

const Ctx = createContext(null);
export const useGuardian = () => useContext(Ctx);

export const PRESET_TOGGLES = {
  relaxed: { favorites: true, activeSquads: true, valuable: false, special: false, locked: true },
  recommended: { favorites: true, activeSquads: true, valuable: true, special: true, locked: true },
  verysafe: { favorites: true, activeSquads: true, valuable: true, special: true, locked: true },
};

export const PRESET_LABELS = {
  relaxed: 'Relaxed',
  recommended: 'Recommended',
  verysafe: 'Very Safe',
  custom: 'Custom',
};

export function GuardianProvider({ children }) {
  const [tab, setTab] = useState('home');
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('sbcg_onboarded') === '1');
  const [preset, setPresetRaw] = useState('recommended');
  const [toggles, setToggles] = useState(PRESET_TOGGLES.recommended);
  const [scenario, setScenario] = useState('normal');
  const [info, setInfo] = useState(null);
  const [toast, setToastMsg] = useState(null);
  const toastTimer = useRef(null);
  const [activity, setActivity] = useState([
    { name: '82+ Upgrade', status: 'Completed', done: true },
    { name: 'Marquee Matchups', status: '3 / 4', done: false },
  ]);

  const setPreset = (p) => {
    setPresetRaw(p);
    if (PRESET_TOGGLES[p]) setToggles(PRESET_TOGGLES[p]);
  };

  const setToggle = (key, val) => {
    setPresetRaw('custom');
    setToggles((t) => ({ ...t, [key]: val }));
  };

  const completeOnboarding = () => {
    localStorage.setItem('sbcg_onboarded', '1');
    setOnboarded(true);
  };

  const resetOnboarding = () => {
    localStorage.removeItem('sbcg_onboarded');
    setOnboarded(false);
    setTab('home');
  };

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const addActivity = (a) => setActivity((prev) => [a, ...prev].slice(0, 4));

  const offline = scenario === 'offline';

  return (
    <Ctx.Provider
      value={{
        tab, setTab,
        onboarded, completeOnboarding, resetOnboarding,
        preset, setPreset, toggles, setToggle,
        scenario, setScenario, offline,
        info, setInfo,
        toast, showToast,
        activity, addActivity,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
