const nanoToSeconds = (nanoseconds: number): number => {
  return !nanoseconds
    ? nanoseconds
    : Number((nanoseconds / 1000000000).toFixed(2));
};

export default nanoToSeconds;
