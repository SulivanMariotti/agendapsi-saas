"use client";

import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle, Clock, XCircle } from 'lucide-react';
import { useUiTheme } from './uiTheme';

// --- Toast (Notificação Flutuante) ---
export const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!message) return null;

  const styles = type === 'error' 
    ? 'bg-white border-l-4 border-red-500 text-slate-700 shadow-red-100' 
    : 'bg-white border-l-4 border-emerald-500 text-slate-700 shadow-emerald-100';
  
  const icon = type === 'error' ? <XCircle className="text-red-500" size={20} /> : <CheckCircle className="text-emerald-500" size={20} />;

  return (
    <div className={`fixed top-6 right-6 z-[9999] ${styles} px-6 py-4 rounded-xl shadow-xl flex items-center gap-4 animate-in slide-in-from-right duration-300 border border-slate-100`}>
      {icon}
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 text-slate-400 hover:text-slate-600">✕</button>
    </div>
  );
};

// --- Botão Padrão (Suavizado) ---
export const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon, as = 'button', ...props }) => {
  const uiTheme = useUiTheme();
  const variants = {
    primary: "bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-200 border border-transparent",
    secondary: "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-800 shadow-sm",
    danger: "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100",
    success: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-200 border border-transparent",
    white: "bg-white text-violet-700 hover:bg-violet-50 shadow-lg shadow-black/5 border-transparent"
  };
  
  const finalVariant = disabled && variant !== 'danger' ? 'secondary' : variant;
  const Component = as;

  // Theme override (used by Patient skin). Admin keeps default.
  const themedVariants = uiTheme?.buttonVariants || uiTheme?.button?.variants;
  const variantClass = themedVariants?.[finalVariant] || variants[finalVariant];

  return (
    <Component 
      onClick={onClick} 
      disabled={disabled} 
      className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm ${variantClass} ${className}`} 
      {...props}
    >
      {Icon && <Icon size={18} strokeWidth={2.5} />}
      <span translate="no">{children}</span> 
    </Component>
  );
};

// --- Cartão Padrão (Bordas e Sombras Suaves) ---
export const Card = ({ children, title, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden flex flex-col ${className}`}>
    {title && (
      <div className="px-6 py-5 border-b border-slate-50 bg-white">
        <h3 className="font-bold text-slate-800 text-lg tracking-tight">{title}</h3>
      </div>
    )}
    <div className="flex-1 p-6 min-h-0">{children}</div>
  </div>
);

// --- Badge de Status (Tons Pastéis) ---
export const Badge = ({ status, text }) => {
  let style = "bg-slate-100 text-slate-500 border-slate-200";
  let icon = null;

  if (status === 'match' || status === 'confirmed') {
    style = "bg-violet-50 text-violet-700 border-violet-100";
    icon = <CheckCircle size={14} />;
  } else if (status === 'missing') {
    style = "bg-red-50 text-red-600 border-red-100";
    icon = <AlertTriangle size={14} />;
  } else if (status === 'time' || status === 'pending') {
    style = "bg-slate-50 text-slate-700 border-slate-100";
    icon = <Clock size={14} />;
  } else if (status === 'signed') {
    style = "bg-emerald-50 text-emerald-600 border-emerald-100";
    icon = <CheckCircle size={14} />;
  } else if (status === 'unsigned') {
    style = "bg-amber-50 text-amber-600 border-amber-100";
    icon = <AlertTriangle size={14} />;
  }

  return (
    <span className={`px-3 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 w-fit whitespace-nowrap transition-colors ${style}`}>
      {icon} {text}
    </span>
  );
};

// --- Cartão de Estatística (Clean) ---
export const StatCard = ({ title, value, subtext, icon: Icon, colorClass }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-5 hover:shadow-md transition-all duration-300">
    <div className={`p-3.5 rounded-xl ${colorClass} bg-opacity-10 text-opacity-100`}>
      <Icon size={24} strokeWidth={2} />
    </div>
    <div>
      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">{title}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {subtext && <p className="text-[10px] text-slate-400 mt-0.5">{subtext}</p>}
    </div>
  </div>
);