import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "subtle" | "danger" | "teal";
type Size = "sm" | "md";

const base = "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none";
const variants: Record<Variant, string> = {
  primary: "bg-navy-800 text-white hover:bg-navy-900",
  teal: "bg-teal-700 text-white hover:bg-teal-800",
  secondary: "bg-white text-navy-800 border border-line hover:border-navy-600 hover:bg-navy-50",
  subtle: "text-navy-800 hover:bg-navy-50",
  danger: "bg-white text-danger-700 border border-danger-700/40 hover:bg-danger-50",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-[15px]" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({ variant = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "secondary", size = "md", className, ...props }: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
