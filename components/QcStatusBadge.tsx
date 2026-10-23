'use client';

import React from 'react';
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { QcDecision } from '@/lib/qc/types';

interface QcStatusBadgeProps {
  decision?: QcDecision | 'UNCHECKED';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
  onClick?: () => void;
}

export function QcStatusBadge({
  decision = 'UNCHECKED',
  size = 'md',
  showIcon = true,
  className = '',
  onClick,
}: QcStatusBadgeProps) {
  let bgClass = 'bg-stone-100 text-stone-700 border-stone-300';
  let label = 'Belum Di-QC';
  let Icon = ShieldQuestion;

  switch (decision) {
    case 'READY':
      bgClass = 'bg-emerald-50 text-emerald-800 border-emerald-600 shadow-[1px_1px_0_#065f46]';
      label = 'READY (Lolos QC)';
      Icon = ShieldCheck;
      break;
    case 'REVIEW':
      bgClass = 'bg-amber-50 text-amber-900 border-amber-600 shadow-[1px_1px_0_#78350f]';
      label = 'REVIEW (Perlu Cek)';
      Icon = AlertTriangle;
      break;
    case 'BLOCK':
      bgClass = 'bg-rose-50 text-rose-800 border-rose-600 shadow-[1px_1px_0_#9f1239]';
      label = 'BLOCK (Ditolak)';
      Icon = ShieldAlert;
      break;
    default:
      bgClass = 'bg-stone-100 text-[#4a3528] border-stone-300';
      label = 'Belum Di-QC';
      Icon = ShieldQuestion;
      break;
  }

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1 font-bold',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-black',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-black',
  };

  const isClickable = !!onClick;

  return (
    <span
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={`inline-flex items-center rounded-lg border-2 select-none transition-all ${
        sizeClasses[size]
      } ${bgClass} ${
        isClickable ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
      } ${className}`}
      title={
        decision === 'READY'
          ? 'Tidak ada isu yang terdeteksi oleh pengujian yang dikonfigurasi'
          : decision === 'REVIEW'
          ? 'Memerlukan konfirmasi atau pemeriksaan manual oleh kontributor'
          : decision === 'BLOCK'
          ? 'Terdapat pelanggaran teknis atau kebijakan resmi yang harus diperbaiki'
          : 'Aset belum diaudit oleh Agen QC'
      }
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
      <span>{label}</span>
    </span>
  );
}
