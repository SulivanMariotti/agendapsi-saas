"use client";

import React from "react";

/**
 * WhatsApp icon (PNG) from /public/brands/whatsapp-white.png
 *
 * Props:
 * - size: number (px)
 * - className: string
 */
export default function WhatsAppIcon({ size = 18, className = "" }) {
  const s = Number(size) > 0 ? Number(size) : 18;

  return (
    <img
      src="/brands/whatsapp-white.png"
      width={s}
      height={s}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ display: "block", background: "transparent", objectFit: "contain" }}
      draggable={false}
    />
  );
}
