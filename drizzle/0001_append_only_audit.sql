-- Migración personalizada: las tablas de bitácora son de solo inserción.
-- La base de datos rechaza cualquier UPDATE o DELETE, venga de la aplicación o de un cliente SQL.
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción: no se permite %', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ticket_events_append_only BEFORE UPDATE OR DELETE ON "ticket_events" FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER account_actions_append_only BEFORE UPDATE OR DELETE ON "account_actions" FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER diagnostic_runs_append_only BEFORE UPDATE OR DELETE ON "diagnostic_runs" FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
