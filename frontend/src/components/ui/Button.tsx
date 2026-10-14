import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  children,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const base =
    'relative inline-flex items-center justify-center font-sans font-semibold transition-colors outline-none cursor-pointer select-none rounded-[10px] disabled:opacity-40 disabled:cursor-not-allowed';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-xs px-3.5 py-2 gap-2',
    lg: 'text-sm px-4 py-2.5 gap-2.5',
  }[size];

  const variantClasses = {
    primary:
      'bg-accent text-accent-ink hover:brightness-105 active:brightness-95 shadow-lift font-bold border border-accent/40',
    secondary:
      'glass hover:bg-surface/80 active:bg-surface text-ink hairline hover:border-line/20',
    ghost:
      'bg-transparent hover:bg-line/10 active:bg-line/15 text-muted hover:text-ink',
    danger:
      'bg-risk-severe/15 text-risk-severe border border-risk-severe/30 hover:bg-risk-severe/25 active:bg-risk-severe/35',
  }[variant];

  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      className={`${base} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </motion.button>
  );
};
