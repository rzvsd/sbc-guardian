import { House, SoccerBall, ShieldCheck, UserCircle } from '@phosphor-icons/react';
import { useGuardian } from '../state/GuardianContext.jsx';

const TABS = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'eafc', label: 'EA FC', Icon: SoccerBall },
  { id: 'protection', label: 'Protection', Icon: ShieldCheck },
  { id: 'profile', label: 'Profile', Icon: UserCircle },
];

export default function BottomNav() {
  const { tab, setTab } = useGuardian();
  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-brd bg-[#0c0c0e]/95 backdrop-blur-xl">
      <div className="flex items-stretch justify-around px-2 pb-4 pt-1.5">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              data-testid={`nav-${id}`}
              onClick={() => setTab(id)}
              className="tap flex min-w-[64px] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5"
            >
              <Icon size={23} weight={active ? 'fill' : 'regular'} className={active ? 'text-jade' : 'text-zinc-500'} />
              <span className={`text-[10.5px] font-medium ${active ? 'text-jade' : 'text-zinc-500'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
