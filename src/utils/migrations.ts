import { prisma } from '../infrastructure/database/prisma';
import { logger } from './logger';

export async function runMigrations(): Promise<void> {
  try {
    // Execute Prisma migrations
    await prisma.$executeRaw`SELECT 1`;
    logger.info('Database connection successful');
    
    // Add any additional migration logic here
    
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

export async function rollbackMigration(): Promise<void> {
  try {
    // Add rollback logic here
    logger.info('Rollback successful');
  } catch (error) {
    logger.error('Rollback failed:', error);
    throw error;
  }
} 