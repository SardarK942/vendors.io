import React from 'react';

type IconProps = { size?: number; className?: string };

export function GoogleCalIcon({ size = 40, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      aria-label="Google Calendar"
    >
      <rect
        x={3}
        y={3}
        width={34}
        height={34}
        rx={3}
        fill="#fff"
        stroke="#DADCE0"
        strokeWidth={0.8}
      />
      <rect x={3} y={3} width={34} height={6} fill="#4285F4" />
      <text
        x={20}
        y={28}
        textAnchor="middle"
        fontFamily="'Google Sans', Arial, sans-serif"
        fontWeight={700}
        fontSize={15}
        fill="#1A73E8"
        letterSpacing="-0.5"
      >
        31
      </text>
    </svg>
  );
}

export function AppleCalIcon({ size = 40, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      aria-label="Apple Calendar"
    >
      <rect
        x={3}
        y={3}
        width={34}
        height={34}
        rx={4}
        fill="#fff"
        stroke="#E5E5E5"
        strokeWidth={0.8}
      />
      <text
        x={20}
        y={13}
        textAnchor="middle"
        fontFamily="-apple-system, 'SF Pro Text', Arial, sans-serif"
        fontWeight={700}
        fontSize={5.5}
        fill="#FF3B30"
        letterSpacing="0.5"
      >
        MON
      </text>
      <text
        x={20}
        y={32}
        textAnchor="middle"
        fontFamily="-apple-system, 'SF Pro Display', Arial, sans-serif"
        fontWeight={300}
        fontSize={17}
        fill="#1A1A1A"
        letterSpacing="-0.5"
      >
        17
      </text>
    </svg>
  );
}

export function OutlookCalIcon({ size = 40, className }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-label="Outlook">
      <rect x={2} y={2} width={36} height={36} rx={4} fill="#0078D4" />
      <rect x={9} y={11} width={22} height={18} rx={1.5} fill="#fff" />
      <rect x={9} y={11} width={22} height={4.5} fill="#106EBE" />
      <line x1={16.3} y1={15.5} x2={16.3} y2={29} stroke="#0078D4" strokeWidth={0.6} />
      <line x1={23.7} y1={15.5} x2={23.7} y2={29} stroke="#0078D4" strokeWidth={0.6} />
      <line x1={9} y1={22} x2={31} y2={22} stroke="#0078D4" strokeWidth={0.6} />
    </svg>
  );
}
