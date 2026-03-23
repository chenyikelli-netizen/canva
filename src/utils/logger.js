// ========================================
// 日誌模組
// 使用 winston 記錄系統運行日誌
// ========================================

import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';
import config from '../config.js';

// 確保 logs 目錄存在
if (!existsSync(config.logs_dir)) {
  mkdirSync(config.logs_dir, { recursive: true });
}

// 日誌格式：時間戳 + 層級 + 訊息
const log_format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
    if (stack) log += `\n${stack}`;
    if (Object.keys(meta).length > 0) {
      log += ` | ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

const logger = winston.createLogger({
  level: 'info',
  format: log_format,
  transports: [
    // 輸出到 console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        log_format
      )
    }),
    // 輸出到檔案（依日期輪替）
    new winston.transports.File({
      filename: `${config.logs_dir}/error.log`,
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 10
    }),
    new winston.transports.File({
      filename: `${config.logs_dir}/combined.log`,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10
    })
  ]
});

export default logger;
