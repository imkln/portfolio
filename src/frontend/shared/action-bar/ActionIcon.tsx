const paths = {
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  tag: 'M3 3h8l10 10-8 8L3 11zM7 7h.01',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  select: 'M3 15V3h12M8 8h13v13H8zM11 14l2 2 5-5',
  edit: 'm4 16-1 5 5-1L21 7l-4-4zM14 6l4 4',
  add: 'M12 4v16M4 12h16',
  photo: 'M3 4h10m8 8v8H3V4m13 2h6m-3-3v6M3 16l5-5 5 5 3-3 5 5',
  caption: 'M4 6V4h16v2m-8-2v16m-4 0h8',
  save: 'm4 12 5 5L20 6',
  close: 'm6 6 12 12M18 6 6 18',
};

export default function ActionIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="action-icon" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
