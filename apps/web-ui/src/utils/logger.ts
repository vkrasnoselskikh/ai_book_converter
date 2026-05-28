export const getLogger = (name: string) => {
  return {
    info: (...args: any[]) => console.log(`[INFO] [${name}]`, ...args),
    error: (...args: any[]) => console.error(`[ERROR] [${name}]`, ...args),
  };
};
export default getLogger;
