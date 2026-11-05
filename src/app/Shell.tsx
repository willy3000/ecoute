import { BarChart3, Dumbbell, Headphones, Library, Settings, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { href } from './router';

const NAV: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'listen', label: 'Listen', icon: Headphones },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'practice', label: 'Practice', icon: Dumbbell },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
];

export function Shell({ section, children }: { section: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-ink-800 px-4 py-6 md:flex">
        <a href={href('listen')} className="french px-3 text-3xl tracking-tight">
          Écoute
        </a>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.id} {...item} active={section === item.id} wide />
          ))}
        </nav>
        <div className="mt-auto">
          <NavLink id="settings" label="Settings" icon={Settings} active={section === 'settings'} wide />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1 md:hidden">
          <a href={href('listen')} className="french text-2xl tracking-tight">
            Écoute
          </a>
          <a href={href('settings')} aria-label="Settings" className={`rounded-lg p-2 ${section === 'settings' ? 'text-teal-soft' : 'text-fg-muted'}`}>
            <Settings size={20} />
          </a>
        </header>
        <main className="flex-1 pb-24 md:pb-8">{children}</main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-ink-800 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map((item) => (
          <NavLink key={item.id} {...item} active={section === item.id} />
        ))}
      </nav>
    </div>
  );
}

function NavLink({ id, label, icon: Icon, active, wide }: { id: string; label: string; icon: LucideIcon; active: boolean; wide?: boolean }) {
  const tone = active ? 'text-teal-soft' : 'text-fg-muted hover:text-fg';
  return wide ? (
    <a href={href(id)} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${tone} ${active ? 'bg-ink-850' : ''}`}>
      <Icon size={18} /> {label}
    </a>
  ) : (
    <a href={href(id)} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${tone}`}>
      <Icon size={20} /> {label}
    </a>
  );
}
