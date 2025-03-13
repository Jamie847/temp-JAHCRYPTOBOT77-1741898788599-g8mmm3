@@ .. @@
 -- Create bot_status table
 CREATE TABLE IF NOT EXISTS bot_status (
-  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+  id serial PRIMARY KEY,
   is_running boolean DEFAULT false,
   last_started timestamptz,
   last_stopped timestamptz,