import { toast } from "vue-sonner";

export function useAppToast() {
  function success(message: string, description?: string): void {
    toast.success(message, { description });
  }

  function error(message: string, description?: string): void {
    toast.error(message, { description });
  }

  function info(message: string, description?: string): void {
    toast.info(message, { description });
  }

  function warning(message: string, description?: string): void {
    toast.warning(message, { description });
  }

  function loading(message: string): string | number {
    return toast.loading(message);
  }

  function dismiss(toastId?: string | number): void {
    toast.dismiss(toastId);
  }

  return {
    success,
    error,
    info,
    warning,
    loading,
    dismiss,
  };
}
