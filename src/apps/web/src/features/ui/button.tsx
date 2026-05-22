import Link from "next/link";
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";

import { buttonClassName, type ButtonVariant } from "./button-styles";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  disabledReason?: string;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className = "",
  disabledReason,
  variant = "secondary",
  type = "button",
  ...props
}: ButtonProps): ReactElement {
  const title =
    props.disabled && disabledReason !== undefined ? disabledReason : props.title;

  return (
    <button
      className={`${buttonClassName(variant)} ${className}`}
      title={title}
      type={type}
      {...props}
    >
      {children}
      {props.disabled && disabledReason !== undefined ? (
        <span className="sr-only">（{disabledReason}）</span>
      ) : null}
    </button>
  );
}

export function ButtonLink({
  children,
  className = "",
  href,
  variant = "secondary",
}: {
  children: ReactNode;
  className?: string;
  href: string;
  variant?: ButtonVariant;
}): ReactElement {
  return (
    <Link className={`${buttonClassName(variant)} ${className}`} href={href}>
      {children}
    </Link>
  );
}
