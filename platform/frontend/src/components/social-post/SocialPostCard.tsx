import { useState } from "react";
import type { SocialPostPayload } from "../../api/socialPost";
import type { Theme } from "./themes";

type Props = {
  payload: SocialPostPayload;
  theme: Theme;
};

const HAND: React.CSSProperties = { fontFamily: "'Caveat', cursive" };

const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg";

function emojiToCodepoint(emoji: string): string {
  return Array.from(emoji)
    .map((ch) => ch.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== "fe0f")
    .join("-");
}

function Twemoji({
  emoji,
  size = 24,
  className,
  style,
}: {
  emoji: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (!emoji) return null;
  if (failed) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1, ...style }}
      >
        {emoji}
      </span>
    );
  }
  const cp = emojiToCodepoint(emoji);
  return (
    <img
      src={`${TWEMOJI_BASE}/${cp}.svg`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    />
  );
}

export function SocialPostCard({ payload, theme }: Props) {
  const { title, meta_bits, problem, steps, outcome, stats } = payload;
  const cleanTitle = (title || "")
    .replace(/\s+in\s+\d+\s*s\.?$/i, "")
    .replace(/\.$/, "")
    .trim();
  const metaBits = meta_bits ?? [];
  const problemLines = (problem.headline || "").split(/\n+/).filter(Boolean);

  return (
    <div
      className="font-sans relative"
      style={{ backgroundColor: theme.bg, color: theme.text, padding: "28px 40px 22px" }}
    >
      {/* HERO */}
      <div className="relative">
        {/* centered "real run" pill */}
        <div className="flex justify-center">
          <RealRunPill theme={theme} />
        </div>

        <h1
          className="tracking-tight text-center"
          style={{
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            marginTop: 12,
            padding: "0 12px",
          }}
        >
          {cleanTitle} in{" "}
          <span className="relative inline-block" style={{ color: theme.accent }}>
            <span
              style={{
                ...HAND,
                fontSize: stats.elapsed_seconds >= 60 ? 68 : 80,
                lineHeight: 0.9,
              }}
              className="inline-block align-[-0.14em]"
            >
              {formatElapsed(stats.elapsed_seconds)}
            </span>
            <Squiggle color={theme.accent} />
          </span>
        </h1>

        {metaBits.length > 0 && (
          <div
            className="text-center"
            style={{ color: theme.muted, fontSize: 13, marginTop: 14, fontWeight: 500 }}
          >
            {metaBits.map((bit, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-2.5" style={{ opacity: 0.5 }}>·</span>}
                {bit}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SITUATION */}
      <InsetPanel theme={theme} labelColor={theme.accent2} label="THE SITUATION" topMargin={18}>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.35 }}>
            {problemLines.length > 0
              ? problemLines.map((line, i) => <div key={i}>{line}</div>)
              : problem.headline}
          </div>
          {problemLines.length === 0 && problem.meta && (
            <div className="mt-1.5" style={{ fontSize: 12, color: theme.muted }}>
              {problem.meta}
            </div>
          )}
        </div>
      </InsetPanel>

      {/* WHAT I DID */}
      <InsetPanel
        theme={theme}
        labelColor={theme.accent}
        label={`WHAT THE AGENT DID (${formatElapsed(stats.elapsed_seconds)})`}
        topMargin={12}
      >
        <StepList steps={steps} theme={theme} />
      </InsetPanel>

      {/* RESULT */}
      <div
        className="relative"
        style={{
          marginTop: 12,
          padding: "10px 18px 14px",
          backgroundColor: theme.panel,
          border: `2px solid ${theme.accent}`,
          borderRadius: 14,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 3,
            color: theme.accent,
          }}
        >
          RESULT
        </div>
        <div
          className="flex items-center gap-3"
          style={{ marginTop: 6 }}
        >
          <div className="shrink-0">
            <Starburst color={theme.accent} />
          </div>
          <div className="flex-1 min-w-0" style={{ fontWeight: 700, fontSize: 24, lineHeight: 1.15 }}>
            <ResultHeadline outcome={outcome} />
          </div>
        </div>
        {outcome.punchline ? (
          <div className="text-center" style={{ marginTop: 6 }}>
            <Punchline text={outcome.punchline} accent={theme.accent} text_color={theme.text} />
          </div>
        ) : (
          outcome.subtitle && (
            <div
              className="text-center"
              style={{ marginTop: 6, fontSize: 13, color: theme.muted }}
            >
              {outcome.subtitle}
            </div>
          )
        )}
      </div>

      {/* FOOTER */}
      <div
        className="flex items-center gap-3"
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <BrandMark />
        <b style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: theme.text }}>
          CONTEXTAGORA
        </b>
        <span style={{ color: theme.muted, opacity: 0.4 }}>|</span>
        <span
          className="flex-1"
          style={{ ...HAND, fontSize: 20, color: theme.muted, lineHeight: 1 }}
        >
          Stop Repeating Yourself.
        </span>
        <span style={{ color: theme.accent2, fontSize: 16 }}>♥</span>
      </div>
    </div>
  );
}

/* ------------------------------ Panels ------------------------------ */

function InsetPanel({
  label,
  labelColor,
  theme,
  children,
  topMargin = 16,
}: {
  label: string;
  labelColor: string;
  theme: Theme;
  children: React.ReactNode;
  topMargin?: number;
}) {
  return (
    <div
      style={{
        marginTop: topMargin,
        padding: "10px 18px 14px",
        backgroundColor: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 3,
          color: labelColor,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------ Hero bits --------------------------- */

function RealRunPill({ theme }: { theme: Theme }) {
  return (
    <div
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: `color-mix(in srgb, ${theme.accent} 12%, transparent)`,
        color: theme.accent,
        border: `1px solid color-mix(in srgb, ${theme.accent} 35%, transparent)`,
      }}
    >
      <span aria-hidden style={{ fontSize: 13 }}>⚡</span>
      real run
    </div>
  );
}

function Squiggle({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 160 14"
      preserveAspectRatio="none"
      aria-hidden
      style={{
        position: "absolute",
        left: 2,
        right: 2,
        bottom: -4,
        width: "calc(100% - 4px)",
        height: 12,
      }}
    >
      <path
        d="M 3 9 Q 18 2, 34 8 T 68 8 T 102 7 T 140 8 L 156 6"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/* ------------------------------ Steps ------------------------------- */

function StepList({
  steps,
  theme,
}: {
  steps: SocialPostPayload["steps"];
  theme: Theme;
}) {
  const rowHeight = 54;
  const tileSize = 44;
  return (
    <div className="relative">
      {/* Dotted vertical timeline */}
      <div
        style={{
          position: "absolute",
          left: 9,
          top: rowHeight / 2 - 3,
          bottom: rowHeight / 2 - 3,
          borderLeft: `2px dotted ${theme.border}`,
          opacity: 0.85,
        }}
        aria-hidden
      />
      <ol className="list-none p-0 m-0">
        {steps.map((step, i) => (
          <li
            key={i}
            className="relative grid items-center"
            style={{
              gridTemplateColumns: `20px ${tileSize}px 1fr`,
              columnGap: 12,
              height: rowHeight,
            }}
          >
            {/* Node dot on timeline */}
            <div className="flex justify-center">
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: theme.muted,
                  opacity: 0.8,
                }}
              />
            </div>

            {/* Icon tile */}
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: tileSize,
                height: tileSize,
                borderRadius: 10,
                backgroundColor: `color-mix(in srgb, ${theme.bg} 60%, ${theme.panel})`,
                border: `1px solid ${theme.border}`,
                lineHeight: 1,
              }}
            >
              {step.icon ? (
                <Twemoji emoji={step.icon} size={24} />
              ) : (
                <span style={{ fontSize: 18, color: theme.muted }}>•</span>
              )}
            </div>

            {/* Main text */}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5">
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: theme.accent,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>
                  {step.text}
                </span>
              </div>
              {step.hint && (
                <div
                  style={{
                    marginTop: 1,
                    fontSize: 12,
                    color: theme.muted,
                    paddingLeft: 22,
                  }}
                >
                  {step.hint}
                </div>
              )}
            </div>

          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------ Result ------------------------------ */

function ResultHeadline({ outcome }: { outcome: SocialPostPayload["outcome"] }) {
  // Prefer composing "{file} {rest-of-title} {emoji}" when a file exists.
  if (outcome.file) {
    const rest = stripTrailingFile(outcome.title, outcome.file);
    return (
      <>
        <span>{outcome.file}</span>
        {rest && <span style={{ marginLeft: 8 }}>{rest}</span>}
        {outcome.emoji && (
          <span style={{ marginLeft: 10, display: "inline-flex", verticalAlign: "middle" }}>
            <Twemoji emoji={outcome.emoji} size={28} />
          </span>
        )}
      </>
    );
  }
  return (
    <>
      <span>{outcome.title}</span>
      {outcome.emoji && (
        <span style={{ marginLeft: 10, display: "inline-flex", verticalAlign: "middle" }}>
          <Twemoji emoji={outcome.emoji} size={28} />
        </span>
      )}
    </>
  );
}

function Punchline({
  text,
  accent,
  text_color,
}: {
  text: string;
  accent: string;
  text_color: string;
}) {
  const segments = text.split(/(\s?(?:→|->)\s?)/g);
  return (
    <span style={{ ...HAND, fontSize: 22, lineHeight: 1.15, color: text_color }}>
      {segments.map((seg, i) =>
        /→|->/.test(seg) ? (
          <span key={i} style={{ color: accent, margin: "0 6px" }}>
            →
          </span>
        ) : (
          <span key={i}>{seg}</span>
        ),
      )}
    </span>
  );
}

function Starburst({ color }: { color: string }) {
  // Hand-drawn feel: uneven ray lengths, subtle rotation per ray.
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden>
      <g
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      >
        <line x1="20" y1="4" x2="20" y2="11" />
        <line x1="20" y1="29" x2="20" y2="36" />
        <line x1="4" y1="20" x2="11" y2="20" />
        <line x1="29" y1="20" x2="36" y2="20" />
        <line x1="9" y1="9" x2="14" y2="14" />
        <line x1="26" y1="26" x2="31" y2="31" />
        <line x1="9" y1="31" x2="14" y2="26" />
        <line x1="26" y1="14" x2="31" y2="9" />
        <circle cx="20" cy="20" r="3" />
      </g>
    </svg>
  );
}

function BrandMark() {
  return (
    <img
      src="/logo.webp"
      alt="Contextagora"
      width={22}
      height={22}
      style={{ display: "block" }}
    />
  );
}

/* ------------------------------ Helpers ----------------------------- */

function stripTrailingFile(title: string, file: string): string {
  if (!file) return title;
  return title.replace(file, "").replace(/^\s*[.:·-]?\s*/, "").trim();
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

