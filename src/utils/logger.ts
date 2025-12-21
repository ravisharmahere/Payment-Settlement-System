function formatIST(date: Date): string {
  // Convert UTC to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
  const istDate = new Date(date.getTime() + istOffset);
  
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} IST`;
}

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`[INFO] ${formatIST(new Date())} - ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${formatIST(new Date())} - ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${formatIST(new Date())} - ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${formatIST(new Date())} - ${message}`, ...args);
    }
  },
};

