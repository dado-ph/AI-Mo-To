import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "../ui/button.js";
import { cn } from "../../lib/utils.js";

export interface HoldToConfirmButtonProps {
  onConfirm: () => void;
  label?: string | undefined;
  holdingLabel?: string | undefined;
  durationMs?: number | undefined;
  disabled?: boolean | undefined;
  variant?: "default" | "outline" | "ghost" | undefined;
  size?: "default" | "sm" | "icon" | undefined;
  className?: string | undefined;
  title?: string | undefined;
  ariaLabel?: string | undefined;
  icon?: React.ReactNode | undefined;
}

export function HoldToConfirmButton({
  onConfirm,
  label = "Delete",
  holdingLabel,
  durationMs = 1000,
  disabled = false,
  variant = "outline",
  size = "sm",
  className,
  title,
  ariaLabel,
  icon
}: HoldToConfirmButtonProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);

  const isHoldingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const cancelHold = useCallback(() => {
    clearTimers();
    isHoldingRef.current = false;
    setHolding(false);
    setProgress(0);
  }, [clearTimers]);

  const startHold = useCallback(() => {
    if (disabled || isHoldingRef.current) return;
    clearTimers();
    isHoldingRef.current = true;
    setHolding(true);
    setProgress(0);
    startTimeRef.current = Date.now();

    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);
    }, 25);

    timerRef.current = window.setTimeout(() => {
      clearTimers();
      isHoldingRef.current = false;
      setHolding(false);
      setProgress(0);
      onConfirm();
    }, durationMs);
  }, [clearTimers, disabled, durationMs, onConfirm]);

  useEffect(() => {
    return () => {
      clearTimers();
      isHoldingRef.current = false;
    };
  }, [clearTimers]);

  const handlePointerOrMouseDown = (
    e?: React.MouseEvent | React.PointerEvent | React.TouchEvent
  ) => {
    if (e && "button" in e && typeof e.button === "number" && e.button !== 0) {
      return;
    }
    startHold();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!isHoldingRef.current && !disabled && !e.repeat) {
        startHold();
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      if (isHoldingRef.current) {
        e.preventDefault();
        cancelHold();
      }
    }
  };

  const currentLabel = holding
    ? holdingLabel
      ? `${holdingLabel} (${Math.round(progress)}%)`
      : `Hold... ${Math.round(progress)}%`
    : label;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled}
      onMouseDown={handlePointerOrMouseDown}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={handlePointerOrMouseDown}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
      onPointerDown={handlePointerOrMouseDown}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      onBlur={cancelHold}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      title={title ?? (disabled ? "Cannot delete currently active workspace" : "Press and hold for 1 second to confirm")}
      aria-label={ariaLabel ?? `${label} (press and hold to confirm)`}
      className={cn(
        "relative overflow-hidden transition-all select-none min-h-[24px] min-w-[24px] text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30",
        holding && "border-destructive/60 bg-destructive/15 scale-[0.98]",
        className
      )}
    >
      {holding && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-destructive/35 transition-all duration-75 pointer-events-none"
          style={{ width: `${progress}%` }}
        />
      )}
      <span className="relative z-10 flex items-center gap-1.5 font-medium">
        {icon ?? <Trash2 className="size-3.5 shrink-0" />}
        <span>{currentLabel}</span>
      </span>
    </Button>
  );
}
