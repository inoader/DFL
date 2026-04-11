"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all outline-none ring-offset-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 dark:ring-offset-slate-950",
  {
    variants: {
      variant: {
        default:
          "bg-slate-900 text-white shadow-sm hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200 dark:focus-visible:ring-slate-700",
        secondary:
          "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:bg-slate-800 dark:hover:text-teal-300 dark:focus-visible:ring-teal-900/50",
        outline:
          "border border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-200 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-700",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
        danger:
          "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-100 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60 dark:focus-visible:ring-rose-900/50",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-2xl px-6",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
