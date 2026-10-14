import React, { useState, useEffect } from 'react';
import { Truck, Sun, Moon, Table2, Command, Search, Check, Sparkles } from 'lucide-react';
import { SCENARIOS, type Scenario } from '../../lib/scenarios';
import type { ThemeName } from '../../lib/tokens';
import { Button } from '../ui/Button';

interface HeaderProps {
  theme: ThemeName;
  onToggleTheme: () => void;
  onSelectScenario: (scenario: Scenario) => void;
  onOpenComparison: () => void;
  hasPlan: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  onSelectScenario,
  onOpenComparison,
  hasPlan,
}) => {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="absolute top-4 left-4 right-4 z-30 pointer-events-none flex items-center justify-between">
        {/* Logo / Brand Badge */}
        <div className="pointer-events-auto glass rounded-[14px] px-3.5 py-2 flex items-center gap-3">
          <div className="w-7 h-7 rounded-[9px] bg-accent flex items-center justify-center text-accent-ink shadow-xs">
            <Truck className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-sm tracking-tight text-ink">
              AEROHAUL
            </span>
            <span className="eyebrow hidden sm:inline">HGV WEATHER ROUTER</span>
          </div>
        </div>

        {/* Center / Action Toolbar */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Quick Scenario Chips (Desktop) */}
          <div className="hidden xl:flex items-center gap-1.5 glass rounded-[14px] p-1.5">
            <span className="eyebrow px-2">SCENARIOS:</span>
            {SCENARIOS.map((sc) => (
              <button
                key={sc.id}
                onClick={() => onSelectScenario(sc)}
                className="text-[11px] font-sans font-medium px-2.5 py-1 rounded-[8px] hover:bg-surface text-ink transition cursor-pointer"
                title={sc.note}
              >
                {sc.label}
              </button>
            ))}
          </div>

          {/* Command Palette Trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="glass rounded-[14px] px-3 py-2 text-xs font-sans text-muted hover:text-ink flex items-center gap-2 cursor-pointer transition"
            title="Open Scenarios Palette (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Presets</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-line/10 rounded text-muted">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          </button>

          {/* Comparison Table Button */}
          {hasPlan && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Table2 className="w-3.5 h-3.5" />}
              onClick={onOpenComparison}
            >
              Compare
            </Button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="glass rounded-[14px] p-2 text-muted hover:text-ink transition cursor-pointer"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-accent" /> : <Moon className="w-4 h-4 text-ink" />}
          </button>
        </div>
      </header>

      {/* Command Palette Modal */}
      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-xs">
          <div className="glass rounded-panel max-w-lg w-full p-4 shadow-panel border hairline animate-fade-in space-y-3">
            <div className="flex items-center justify-between border-b hairline pb-2">
              <div className="flex items-center gap-2 text-xs font-display font-semibold text-ink">
                <Command className="w-4 h-4 text-accent" />
                <span>Quick Freight Scenarios</span>
              </div>
              <span className="text-[10px] font-mono text-muted">ESC to close</span>
            </div>

            <div className="space-y-1.5">
              {SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => {
                    onSelectScenario(sc);
                    setPaletteOpen(false);
                  }}
                  className="w-full text-left p-3 rounded-[12px] hover:bg-surface border hairline transition flex items-start justify-between group cursor-pointer"
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-ink group-hover:text-accent transition-colors">
                      {sc.label}
                    </div>
                    <div className="text-[11px] text-muted">{sc.note}</div>
                  </div>
                  <span className="num text-[11px] text-muted shrink-0">
                    {sc.load_weight_lb.toLocaleString()} lb
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
