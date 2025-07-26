import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    // Add custom formatting for development
    nodeEnv === 'development' 
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
            }`;
          })
        )
      : winston.format.json()
  ),
  defaultMeta: { service: 'payment-api' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      silent: process.env.NODE_ENV === 'test'
    }),
    
    // File transports for production
    ...(nodeEnv === 'production' ? [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
    ] : [])
  ]
});

// Create a stream for express morgan if needed
export const loggerStream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};