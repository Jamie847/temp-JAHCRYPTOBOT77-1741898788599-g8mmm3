import { supabase } from '../../supabase/index.js';
import { logger } from '../../logger/index.js';

export class DataVerifier {
  async verifyDataPopulation(): Promise<{
    status: 'healthy' | 'degraded' | 'failed';
    tables: Record<string, {
      count: number;
      lastUpdate: string | null;
      status: 'ok' | 'stale' | 'empty';
    }>;
    errors: string[];
  }> {
    const errors: string[] = [];
    const tables: Record<string, any> = {};

    try {
      // Check critical tables
      const requiredTables = ['pump_tokens', 'bot_status'];
      const optionalTables = [
        'token_mentions',
        'twitter_analyses',
        'social_metrics',
        'market_conditions'
      ];

      // Check required tables first
      for (const table of requiredTables) {
        try {
          // Get count and most recent record
          const [{ count }, { data: latest }] = await Promise.all([
            supabase.from(table).select('*', { count: 'exact', head: true }),
            supabase.from(table)
              .select('created_at')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()
          ]);

          const lastUpdate = latest?.created_at;
          const now = new Date();
          const timeSinceUpdate = lastUpdate ? now.getTime() - new Date(lastUpdate).getTime() : null;
          
          // Determine status
          let status: 'ok' | 'stale' | 'empty' = 'ok';
          if (count === 0) {
            errors.push(`Required table ${table} is empty`);
          } else if (timeSinceUpdate && timeSinceUpdate > 3600000) { // 1 hour
            errors.push(`Required table ${table} is stale`);
          }

          tables[table] = {
            count: count || 0,
            lastUpdate,
            status
          };

          if (status !== 'ok') {
            errors.push(`Table ${table} is ${status}`);
          }

        } catch (error) {
          logger.error(`Error checking table ${table}:`, error);
          errors.push(`Failed to verify required table ${table}`);
          tables[table] = {
            count: 0,
            lastUpdate: null,
            status: 'failed'
          };
        }
      }

      // Check optional tables
      for (const table of optionalTables) {
        try {
          const [{ count }, { data: latest }] = await Promise.all([
            supabase.from(table).select('*', { count: 'exact', head: true }),
            supabase.from(table)
              .select('created_at')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()
          ]);

          const lastUpdate = latest?.created_at;
          const now = new Date();
          const timeSinceUpdate = lastUpdate ? now.getTime() - new Date(lastUpdate).getTime() : null;
          
          let status: 'ok' | 'stale' | 'empty' = 'ok';
          if (count === 0) {
            status = 'empty';
            logger.warn(`Optional table ${table} is empty`);
          } else if (timeSinceUpdate && timeSinceUpdate > 3600000) {
            status = 'stale';
            logger.warn(`Optional table ${table} is stale`);
          }

          tables[table] = {
            count: count || 0,
            lastUpdate,
            status
          };

        } catch (error) {
          logger.warn(`Error checking optional table ${table}:`, error);
          tables[table] = {
            count: 0,
            lastUpdate: null,
            status: 'failed'
          };
        }
      }

      // Verify bot status specifically
      const { data: botStatus } = await supabase
        .from('bot_status')
        .select('*')
        .eq('id', 1)
        .single();

      if (!botStatus) {
        errors.push('Bot status record not found');
      }

      // Log verification results
      logger.info('Data verification completed:', {
        tables,
        errors: errors.length ? errors : 'No errors'
      });

      // Only fail if required tables have errors
      const requiredTableErrors = errors.filter(error => 
        error.includes('Required table') || error.includes('Bot status')
      );

      return {
        status: requiredTableErrors.length === 0 ? 'healthy' : requiredTableErrors.length < 2 ? 'degraded' : 'failed',
        tables,
        errors
      };
    } catch (error) {
      logger.error('Error verifying data population:', error);
      return {
        status: 'failed',
        tables,
        errors: [...errors, 'Failed to complete data verification']
      };
    }
  }

  async verifyDataAccess(): Promise<{
    canRead: boolean;
    canWrite: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Test read access
      const { data: readTest, error: readError } = await supabase
        .from('bot_status')
        .select('*')
        .limit(1);

      if (readError) {
        errors.push(`Read access error: ${readError.message}`);
      }

      // Test write access with a test record
      const testData = {
        id: 999999, // Use a high ID that won't conflict
        is_running: false,
        active_positions: 0,
        pending_orders: 0
      };

      const { error: writeError } = await supabase
        .from('bot_status')
        .upsert(testData);

      if (writeError) {
        errors.push(`Write access error: ${writeError.message}`);
      }

      // Clean up test record
      await supabase
        .from('bot_status')
        .delete()
        .eq('id', 999999);

      return {
        canRead: !readError,
        canWrite: !writeError,
        errors
      };
    } catch (error) {
      logger.error('Error verifying data access:', error);
      return {
        canRead: false,
        canWrite: false,
        errors: [...errors, 'Failed to verify data access']
      };
    }
  }
}
