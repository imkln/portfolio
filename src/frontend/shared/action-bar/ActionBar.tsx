import type { ReactNode } from 'react';
import './ActionBar.css';

export default function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>;
}
