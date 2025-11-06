import { ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost";
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "default", ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/50 disabled:opacity-50 disabled:pointer-events-none h-10 px-4 py-2";
    const variants: Record<NonNullable<Props["variant"]>, string> = {
      default: "bg-black text-white hover:opacity-90",
      secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
      ghost: "bg-transparent hover:bg-gray-100",
    };
    return (
      <button ref={ref} className={clsx(base, variants[variant], className)} {...props} />
    );
  }
);
Button.displayName = "Button";

