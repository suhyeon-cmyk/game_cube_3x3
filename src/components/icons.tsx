const P = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const PlayIcon = () => (
  <svg {...P} fill="currentColor" stroke="none">
    <path d="M7 4.5v15l13-7.5z" />
  </svg>
);
export const PauseIcon = () => (
  <svg {...P} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4" height="15" rx="1" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" />
  </svg>
);
export const StepIcon = () => (
  <svg {...P} fill="currentColor" stroke="none">
    <path d="M5 4.5v15l11-7.5z" />
    <rect x="17" y="4.5" width="3" height="15" rx="1" />
  </svg>
);
export const StopIcon = () => (
  <svg {...P} fill="currentColor" stroke="none">
    <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
  </svg>
);
export const UndoIcon = () => (
  <svg {...P}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
export const ViewResetIcon = () => (
  <svg {...P}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
export const LabelIcon = () => (
  <svg {...P}>
    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
  </svg>
);
export const ShuffleIcon = () => (
  <svg {...P}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
);
export const LightbulbIcon = () => (
  <svg {...P}>
    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
  </svg>
);
export const CameraIcon = () => (
  <svg {...P}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </svg>
);
export const PaletteIcon = () => (
  <svg {...P}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" />
    <circle cx="7.5" cy="11" r="1.2" fill="currentColor" />
    <circle cx="10" cy="7" r="1.2" fill="currentColor" />
    <circle cx="15" cy="7.5" r="1.2" fill="currentColor" />
  </svg>
);
