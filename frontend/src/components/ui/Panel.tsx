import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

interface PanelProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  strong?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  children,
  className = '',
  strong = false,
  ...props
}) => {
  return (
    <motion.div
      className={`glass rounded-panel ${strong ? 'bg-surface/95' : ''} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
};
