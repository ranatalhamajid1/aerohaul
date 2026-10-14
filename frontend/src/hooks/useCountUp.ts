import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Animate a number from its previous value to `target` (ease-out cubic). */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const e = 1 - (1 - t) ** 3;
      const v = from + (target - from) * e;
      setValue(v);
      fromRef.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);

  return value;
}
