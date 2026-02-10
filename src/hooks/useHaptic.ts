export const useHaptic = () => {
  const triggerLight = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const triggerMedium = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(100);
    }
  };

  const triggerSuccess = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 50, 50]);
    }
  };

  return { triggerLight, triggerMedium, triggerSuccess };
};