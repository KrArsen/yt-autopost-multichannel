import {
  CalendarClock,
  CheckSquare,
  ListVideo,
  LogOut,
  Settings,
  Tv,
  UploadCloud,
  Youtube,
} from 'lucide-react';
import type { SettingsResponse } from '../types';

export type NavTab = 'upload' | 'queue' | 'channels' | 'presets' | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  queueCount: number;
  channelsCount: number;
  settings: SettingsResponse | null;
  passwordEnabled: boolean;
  onLogout: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  queueCount,
  channelsCount,
  settings,
  passwordEnabled,
  onLogout,
}: SidebarProps) {
  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: typeof UploadCloud;
    badge?: number;
  }> = [
    { id: 'upload', label: 'Завантажити / Запланувати', icon: UploadCloud },
    { id: 'queue', label: 'Черга та Розклад', icon: CalendarClock, badge: queueCount },
    { id: 'channels', label: 'Канали (Акаунти)', icon: Tv, badge: channelsCount },
    { id: 'presets', label: 'Пресети (Авто-галочки)', icon: CheckSquare },
    { id: 'settings', label: 'Налаштування Google API', icon: Settings },
  ];

  const used = settings?.quota.liveUploadsUsed ?? 0;
  const limit = settings?.quota.liveUploadsLimit ?? 100;
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  return (
    <aside className="w-full lg:w-72 shrink-0 bg-slate-900/80 border-b lg:border-b-0 lg:border-r border-slate-800/80 flex flex-col justify-between">
      <div>
        <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-lg shadow-rose-950/50">
            <Youtube className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-white">YT AutoPost</div>
            <div className="text-xs text-slate-400">
              {window.electronDesktop ? 'Desktop App • Локально' : 'Multi-Channel Studio'}
            </div>
          </div>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1.5 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${active ? 'text-rose-400' : 'text-slate-400'}`} />
                  {item.label}
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full font-semibold ${
                      active ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="hidden lg:flex flex-col gap-3 p-4 border-t border-slate-800/80">
        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 flex items-center gap-1.5">
              <ListVideo className="w-3.5 h-3.5 text-rose-400" />
              Квота API (за добу PT)
            </span>
            <span className="font-semibold text-slate-200">
              {used} / {limit}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${pct >= 85 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              OAuth:{' '}
              {settings?.oauthConfigured ? (
                <span className="text-emerald-400">Налаштовано</span>
              ) : (
                <span className="text-amber-400">Лише Sandbox</span>
              )}
            </span>
            {(settings?.quota.demoUploadsCount ?? 0) > 0 && (
              <span>Тест: {settings?.quota.demoUploadsCount}</span>
            )}
          </div>
        </div>

        {passwordEnabled && (
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Вийти з панелі
          </button>
        )}
      </div>
    </aside>
  );
}
