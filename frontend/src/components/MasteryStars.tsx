import { motion, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';

interface MasteryStarsProps {
  stars: number; // 0=untested, 1-3=rated
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

const STAR_COLORS = [
  '', // 0 = untested
  '#f97316', // 1 = orange
  '#eab308', // 2 = yellow
  '#22d3ee', // 3 = cyan
];

const STAR_LABELS = ['', 'Beginner', 'Developing', 'Mastered'];

export function MasteryStars({ stars, size = 'sm', showLabel = false }: MasteryStarsProps) {
  const reduceMotion = useReducedMotion();
  if (stars <= 0) return null;

  const color = STAR_COLORS[stars] || STAR_COLORS[1];
  const dim = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3].map((i) => (
        <motion.svg
          key={i}
          initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduceMotion ? { duration: 0 } : { delay: i * 0.1, type: 'spring', stiffness: 400, damping: 20 }}
          className={dim}
          viewBox="0 0 24 24"
          fill={i <= stars ? color : 'none'}
          stroke={i <= stars ? color : 'rgba(255,255,255,0.15)'}
          strokeWidth={2}
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </motion.svg>
      ))}
      {showLabel && (
        <span
          className={clsx(
            'text-[10px] font-medium font-[Inter] ml-1',
            size === 'sm' ? 'text-[10px]' : 'text-xs'
          )}
          style={{ color }}
        >
          {STAR_LABELS[stars]}
        </span>
      )}
    </div>
  );
}
