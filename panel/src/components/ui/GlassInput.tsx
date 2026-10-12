/* ════════════════════════════════════════════════════════════════
   src/components/ui/GlassInput.tsx
   Reusable glassmorphism input with label and error state
════════════════════════════════════════════════════════════════ */

'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface GlassInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:       string;
  error?:       string;
  hint?:        string;
  leftIcon?:    React.ReactNode;
  rightIcon?:   React.ReactNode;
  containerCls?: string;
}

const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      className,
      containerCls,
      id: externalId,
      ...inputProps
    },
    ref,
  ) => {
    const autoId = useId();
    const id     = externalId ?? autoId;

    return (
      <div className={cn('flex flex-col gap-1.5', containerCls)}>
        {/* Label */}
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-white/70 select-none"
          >
            {label}
            {inputProps.required && (
              <span className="ml-1 text-arc-orange-400">*</span>
            )}
          </label>
        )}

        {/* Input wrapper */}
        <div className="relative flex items-center">
          {/* Left icon */}
          {leftIcon && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 text-white/40"
            >
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={id}
            className={cn(
              /* Glass base */
              'w-full bg-white/[0.05] border border-white/[0.10] rounded-xl',
              'text-white/92 text-sm placeholder:text-white/30',
              'backdrop-blur-md',
              'px-3.5 py-2.5 h-10',
              'outline-none transition-all duration-200',
              /* Focus ring */
              'focus:border-arc-cyan-400/70 focus:bg-white/[0.08]',
              'focus:shadow-[0_0_0_2px_rgba(0,204,255,0.18)]',
              /* Error state */
              error && 'border-arc-orange-400/60 focus:border-arc-orange-400 focus:shadow-[0_0_0_2px_rgba(251,140,58,0.20)]',
              /* Icon padding */
              leftIcon  && 'pl-9',
              rightIcon && 'pr-9',
              className,
            )}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${id}-error` : hint ? `${id}-hint` : undefined
            }
            {...inputProps}
          />

          {/* Right icon */}
          {rightIcon && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 text-white/40"
            >
              {rightIcon}
            </span>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-xs text-arc-orange-400 flex items-center gap-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5 shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}

        {/* Hint */}
        {!error && hint && (
          <p id={`${id}-hint`} className="text-xs text-white/35">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

GlassInput.displayName = 'GlassInput';

export default GlassInput;
