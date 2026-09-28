'use client';

import * as React from 'react';
import type { MeasurementHighlight } from '@/lib/products/measurement-schemas';

// Made-to-measure body diagram. Ports the two <g> figure groups
// (#figFemale / #figMale) and the reusable highlight primitives
// (#hiBand / #hiLine / #hiPoint) from the vetted prototype
// scratchpad/measure-modal.html verbatim, so the diagram matches the design.
//
// Figure body/line colors come from Baazar tokens (cream-soft body,
// ink-soft outline); the active-measurement highlight is hot-pink.

export interface MeasurementFigureProps {
  figure: 'female' | 'male';
  hi: MeasurementHighlight;
  className?: string;
}

/** Arrowhead marker id — unique per figure orientation avoids id clashes. */
const MARKER_ID = 'measure-arrowhead';

export function MeasurementFigure({ figure, hi, className }: MeasurementFigureProps) {
  return (
    <svg viewBox="0 0 220 400" className={className} aria-hidden="true">
      <defs>
        <marker id={MARKER_ID} markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto">
          <path d="M1.5,1.5 L7.5,4.5 L1.5,7.5 Z" className="fill-hot-pink" />
        </marker>
      </defs>

      {/* FEMALE */}
      {figure === 'female' && (
        <g
          className="fill-none stroke-ink-soft [&_circle]:fill-cream-soft [&_path]:fill-cream-soft"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <circle cx="110" cy="40" r="19" />
          <path d="M103,57 v9 M117,57 v9" className="!fill-none" />
          <path d="M103,66 L78,82 L74,96 L82,150 L92,172 M117,66 L142,82 L146,96 L138,150 L128,172" />
          <path d="M82,150 L138,150" className="!fill-none" opacity=".45" />
          <path d="M103,66 Q110,62 117,66" className="!fill-none" />
          <path d="M78,82 L64,150 L66,178 L74,178 L80,152 M142,82 L156,150 L154,178 L146,178 L140,152" />
          <path d="M92,172 L128,172 L162,368 L58,368 Z" />
          <path d="M110,176 L110,368" className="!fill-none" opacity=".3" strokeDasharray="3 6" />
          <path d="M52,372 L168,372" className="!fill-none" opacity=".4" strokeWidth="1.25" />
          <path d="M96,368 q-2,8 6,9 M124,368 q2,8 -6,9" className="!fill-none" />
        </g>
      )}

      {/* MALE */}
      {figure === 'male' && (
        <g
          className="fill-none stroke-ink-soft [&_circle]:fill-cream-soft [&_path]:fill-cream-soft"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <circle cx="110" cy="38" r="18" />
          <path d="M105,53 L105,63 M115,53 L115,63" className="!fill-none" />
          <path d="M105,60 L72,80 L78,152 L80,300 L140,300 L142,152 L148,80 L115,60 Z" />
          <path d="M105,60 Q110,56 115,60" className="!fill-none" />
          <path d="M105,61 L110,71 L115,61" className="!fill-none" />
          <path d="M110,71 L110,300" className="!fill-none" opacity=".3" strokeDasharray="3 6" />
          <path d="M72,80 L60,150 L62,196 L72,196 L80,150 L78,88 Z M148,80 L160,150 L158,196 L148,196 L140,150 L142,88 Z" />
          <path d="M84,300 L82,368 L98,368 L100,300 M120,300 L122,368 L138,368 L136,300" />
          <path d="M76,372 L144,372" className="!fill-none" opacity=".4" strokeWidth="1.25" />
          <path d="M82,368 q-2,7 6,8 M138,368 q2,7 -6,8" className="!fill-none" />
        </g>
      )}

      {/* Active-measurement highlight */}
      <g className="stroke-hot-pink">
        {hi.t === 'band' && (
          <ellipse cx="110" cy={hi.cy} rx={hi.rx} ry="7" fill="none" strokeWidth="2.5" />
        )}
        {hi.t === 'line' && (
          <line
            x1={hi.x1}
            y1={hi.y1}
            x2={hi.x2}
            y2={hi.y2}
            strokeWidth="2.5"
            markerStart={`url(#${MARKER_ID})`}
            markerEnd={`url(#${MARKER_ID})`}
          />
        )}
        {hi.t === 'point' && (
          <circle cx={hi.cx} cy={hi.cy} r={hi.r} fill="none" strokeWidth="2.5" />
        )}
      </g>
    </svg>
  );
}
