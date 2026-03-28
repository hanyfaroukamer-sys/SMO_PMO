import { useEffect, useRef, useCallback } from "react";

/**
 * Warns user before navigating away when there are unsaved changes.
 * Uses the browser's beforeunload event for tab close/refresh,
 * and provides a guard function for in-app navigation.
 */
export function useUnsavedWarning(isDirty: boolean) {
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  // Browser tab close / refresh warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Guard for in-app navigation (call before navigate)
  const confirmLeave = useCallback((): boolean => {
    if (!dirtyRef.current) return true;
    return window.confirm("You have unsaved changes. Are you sure you want to leave?");
  }, []);

  return { confirmLeave };
}
