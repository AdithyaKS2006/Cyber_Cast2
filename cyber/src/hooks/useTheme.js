import { useState, useEffect } from 'react';

/**
 * useTheme hook
 * Observes 'light-mode' class on document.documentElement
 * Returns boolean isLight
 */
export const useTheme = () => {
  const [isLight, setIsLight] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('light-mode')
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const checkTheme = () => {
      setIsLight(document.documentElement.classList.contains('light-mode'));
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return isLight;
};

export default useTheme;
