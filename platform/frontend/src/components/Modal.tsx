import { useEffect, type ReactNode } from "react";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** Skip closing when the backdrop is clicked */
  disableBackdropClick?: boolean;
  /** Skip the built-in Escape-key handler (use when the consumer needs custom Escape logic) */
  disableEscape?: boolean;
  /** Tailwind classes for the backdrop, default "bg-black/80" */
  backdropClass?: string;
}

export function Modal({
  onClose,
  children,
  disableBackdropClick,
  disableEscape,
  backdropClass = "bg-black/80",
}: ModalProps) {
  useEffect(() => {
    if (disableEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, disableEscape]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${backdropClass}`}
      onClick={disableBackdropClick ? undefined : onClose}
    >
      {children}
    </div>
  );
}
