"use client";

import { useState } from "react";

import type { TeamPresentation } from "@/lib/teams";

function fallbackCode(code: string | null) {
  if (!code) return "--";
  const normalized = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "--";
  return normalized;
}

function FlagMark({ team, compact = false }: { team: TeamPresentation; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const sizeClass = compact ? "h-5 w-8 rounded-[3px]" : "h-6 w-9 rounded-[4px]";
  if (team.flagUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.flagUrl}
        alt={`Bandera de ${team.nameEs}`}
        onError={() => setFailed(true)}
        className={`mr-2 inline-block ${sizeClass} border border-cyan-100/35 object-cover align-middle shadow-[0_0_0_1px_rgba(4,14,24,0.7)]`}
      />
    );
  }
  return (
    <span className="mr-2 inline-block rounded-[4px] border border-cyan-100/35 bg-cyan-300/15 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-cyan-50">
      {fallbackCode(team.code2)}
    </span>
  );
}

export function TeamBadge({
  team,
  compact = false,
  className = "",
}: {
  team: TeamPresentation;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center ${className}`} title={team.nameEs}>
      <FlagMark team={team} compact={compact} />
      <span className="block truncate whitespace-nowrap">{team.nameEs}</span>
    </span>
  );
}
