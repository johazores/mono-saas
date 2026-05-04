import type { ReactNode, InputHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
};

export type StatusBadgeVariant =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "muted";

export type StatusBadgeProps = {
  status: string;
  variant?: StatusBadgeVariant;
};

export type NoticeProps = {
  message: string;
  variant?: "success" | "error" | "info" | "warning";
};

export type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export type FormFieldProps = {
  label: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export type FormSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export type EmptyStateProps = {
  message: string;
  action?: ReactNode;
};

export type ModalProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

export type NavItem = {
  label: string;
  href: string;
};

export type StatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
};

export type DashboardCardProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  href?: string;
  children?: ReactNode;
};
