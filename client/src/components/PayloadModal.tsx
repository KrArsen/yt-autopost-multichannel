import { Code2, Terminal, X } from 'lucide-react';
import type { JobRecord } from '../types';

export function PayloadModal({ job, onClose }: { job: JobRecord | null; onClose: () => void }) {
  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-white text-base">
              Інспектор YouTube API & Логи — #{job.id}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xl">{job.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              <Code2 className="w-4 h-4 text-rose-400" />
              Payload для YouTube Data API v3 (videos.insert)
            </div>
            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-emerald-300 overflow-x-auto leading-relaxed">
              {JSON.stringify(job.apiPayload, null, 2)}
            </pre>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              <Terminal className="w-4 h-4 text-sky-400" />
              Журнал виконання воркера
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto">
              {job.logs.length === 0 ? (
                <div className="text-xs text-slate-500">Логів поки немає.</div>
              ) : (
                job.logs.map((entry, idx) => (
                  <div key={idx} className="text-xs flex items-start gap-2.5">
                    <span className="text-slate-500 font-mono shrink-0">
                      {new Date(entry.at).toLocaleTimeString('uk-UA')}
                    </span>
                    <span
                      className={
                        entry.level === 'error'
                          ? 'text-rose-400'
                          : entry.level === 'warn'
                            ? 'text-amber-300'
                            : 'text-slate-200'
                      }
                    >
                      {entry.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
