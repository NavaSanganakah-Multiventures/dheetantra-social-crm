export const allTableNames = [
  'calls',
  'whatsapp_templates',
  'whatsapp_flows',
  'waba_phone_numbers',
  'waba_accounts',
  'fcm_tokens',
  'email_templates',
  'domain_emails',
  'domains',
  'api_domains',
  'scheduled_posts',
  'broadcast_campaigns',
  'whatsapp_configs',
  'messages',
  'conversations',
  'contacts',
  'otps',
  'sessions',
  'workspace_members',
  'workspaces',
  'users',
  'plans'
];

export interface ParsedTable {
  name: string;
  columns: string[];
  sql: string;
}

export interface ParsedSchema {
  tables: ParsedTable[];
}

export function parseSchemaSQL(sql: string): ParsedSchema {
  const tables: ParsedTable[] = [];
  const createTableRegex = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
  
  let match;
  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const columnsBlock = match[2];
    
    const lines = columnsBlock.split('\n').map(line => line.trim());
    const columns = [];
    
    for (let line of lines) {
      line = line.replace(/--.*$/, '').trim();
      if (!line) {
        continue;
      }
      const upperLine = line.toUpperCase();
      if (upperLine.startsWith('PRIMARY KEY') || 
          upperLine.startsWith('FOREIGN KEY') || 
          upperLine.startsWith('UNIQUE') ||
          upperLine.startsWith('CONSTRAINT') ||
          upperLine.startsWith('CHECK')) {
        continue;
      }
      const colMatch = line.match(/^([a-zA-Z0-9_]+)/);
      if (colMatch && colMatch[1]) {
        columns.push(colMatch[1]);
      }
    }
    
    tables.push({
      name: tableName,
      columns,
      sql: match[0]
    });
  }
  
  return { tables };
}

export interface MigrationDiff {
  missingTables: { name: string, sql: string }[];
  missingColumns: { table: string, column: string, sql: string }[];
  extraTables: string[];
}

export async function diffSchema(db: any, schemaSqlContent: string): Promise<MigrationDiff> {
  const expectedSchema = parseSchemaSQL(schemaSqlContent);
  const diff: MigrationDiff = {
    missingTables: [],
    missingColumns: [],
    extraTables: []
  };

  // Get current tables from DB
  const tablesResult = await db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
  const currentTables = tablesResult.results || [];
  const currentTableMap = new Map(currentTables.map((t: any) => [t.name, t]));

  // Check expected tables against current DB
  for (const expectedTable of expectedSchema.tables) {
    const currentTable = currentTableMap.get(expectedTable.name);
    
    if (!currentTable) {
      diff.missingTables.push({
        name: expectedTable.name,
        sql: expectedTable.sql
      });
    } else {
      // Check for missing columns
      // Parse current table SQL or use pragma table_info
      const pragmaResult = await db.prepare(`PRAGMA table_info(${expectedTable.name})`).all();
      const currentColumns = new Set((pragmaResult.results || []).map((c: any) => c.name));
      
      for (const expectedCol of expectedTable.columns) {
        if (!currentColumns.has(expectedCol)) {
          // Find the exact line in expectedTable.sql to get column type and constraints
          const lines = expectedTable.sql.split('\n');
          let colDef = '';
          for (let line of lines) {
            line = line.trim();
            const cleanLine = line.replace(/--.*$/, '').trim();
            if (new RegExp("^" + expectedCol + "\\b", "i").test(cleanLine)) {
              colDef = cleanLine;
              if (colDef.endsWith(',')) {
                colDef = colDef.substring(0, colDef.length - 1).trim();
              }
              break;
            }
          }
          
          if (colDef) {
            diff.missingColumns.push({
              table: expectedTable.name,
              column: expectedCol,
              sql: `ALTER TABLE ${expectedTable.name} ADD COLUMN ${colDef}`
            });
          }
        }
      }
    }
  }

  // Find extra tables in DB (excluding sqlite internal tables)
  const expectedTableNames = new Set(expectedSchema.tables.map(t => t.name));
  for (const currentTable of currentTables) {
    if (!currentTable.name.startsWith('sqlite_') && 
        !currentTable.name.startsWith('_cf_') && 
        !currentTable.name.startsWith('d1_') && 
        !expectedTableNames.has(currentTable.name)) {
      diff.extraTables.push(currentTable.name);
    }
  }

  return diff;
}
