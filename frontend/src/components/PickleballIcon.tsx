import React from 'react';

interface PickleballIconProps {
  size?: number;
  className?: string;
}

/** Neon yellow pickleball with holes */
const PickleballIcon: React.FC<PickleballIconProps> = ({ size = 32, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <circle cx="32" cy="32" r="30" fill="#CCFF00" stroke="#A3CC00" strokeWidth="2" />
    <circle cx="20" cy="18" r="3.5" fill="#A3CC00" />
    <circle cx="38" cy="14" r="3" fill="#A3CC00" />
    <circle cx="48" cy="24" r="3.5" fill="#A3CC00" />
    <circle cx="14" cy="34" r="3" fill="#A3CC00" />
    <circle cx="28" cy="30" r="3.5" fill="#A3CC00" />
    <circle cx="44" cy="38" r="3" fill="#A3CC00" />
    <circle cx="22" cy="46" r="3.5" fill="#A3CC00" />
    <circle cx="36" cy="48" r="3" fill="#A3CC00" />
    <circle cx="50" cy="46" r="2.5" fill="#A3CC00" />
    <circle cx="16" cy="24" r="2.5" fill="#A3CC00" />
    <circle cx="42" cy="28" r="2.5" fill="#A3CC00" />
    <circle cx="30" cy="42" r="2.5" fill="#A3CC00" />
  </svg>
);

export default PickleballIcon;
