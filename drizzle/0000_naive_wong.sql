CREATE TYPE "public"."diagnosis" AS ENUM('INFRA_OK_CLIENT_SIDE', 'SERVICE_DEGRADED', 'GATEWAY_UNREACHABLE', 'DNS_RESOLUTION_FAILED', 'DIAGNOSTIC_TOOL_UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_target" AS ENUM('vpn', 'services');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_run_status" AS ENUM('ok', 'issues', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."agent_name" AS ENUM('triage', 'diagnostics', 'escalation');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('ACCESS_IDENTITY', 'INFRA_SOFTWARE', 'PROVISIONING');--> statement-breakpoint
CREATE TYPE "public"."ticket_channel" AS ENUM('chat', 'email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('DIAGNOSTIC', 'ACTION');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('P1', 'P2', 'P3', 'P4');--> statement-breakpoint
CREATE TYPE "public"."escalation_queue" AS ENUM('N1-Humano', 'N2-Guardia', 'N2-Redes', 'N2-Infraestructura', 'Aprovisionamiento');--> statement-breakpoint
CREATE TYPE "public"."ticket_subtype" AS ENUM('ACCOUNT_LOCKED', 'PASSWORD_RESET', 'MFA_ISSUE', 'ACCOUNT_DISABLED', 'VPN_CONNECTIVITY', 'PERFORMANCE', 'APP_INCIDENT', 'FOLDER_REPO_ACCESS', 'LICENSE_REQUEST', 'PROFILE_CHANGE');--> statement-breakpoint
CREATE TYPE "public"."ticket_state" AS ENUM('NEW', 'TRIAGED', 'IN_DIAGNOSIS', 'PENDING_USER', 'ESCALATED', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'locked', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."lock_reason" AS ENUM('failed_attempts', 'security_hold', 'inactivity');--> statement-breakpoint
CREATE TYPE "public"."remediation_action" AS ENUM('unlock_account', 'send_reset_link');--> statement-breakpoint
CREATE TYPE "public"."remediation_outcome" AS ENUM('DONE', 'NOT_APPLICABLE', 'ACCOUNT_NOT_FOUND', 'PRECONDITION_FAILED', 'POSTCHECK_FAILED');--> statement-breakpoint
CREATE TABLE "diagnostic_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_code" text NOT NULL,
	"target" "diagnostic_target" NOT NULL,
	"status" "diagnostic_run_status" NOT NULL,
	"diagnosis" "diagnosis" NOT NULL,
	"attempts" integer NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"from_state" "ticket_state",
	"to_state" "ticket_state" NOT NULL,
	"reason" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"reference" text NOT NULL,
	"verified" boolean NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_evidence_reference_uq" UNIQUE("ticket_id","reference")
);
--> statement-breakpoint
CREATE TABLE "ticket_handoffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"from_agent" "agent_name" NOT NULL,
	"to_agent" "agent_name" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"state" "ticket_state" DEFAULT 'NEW' NOT NULL,
	"owner" "agent_name" DEFAULT 'triage' NOT NULL,
	"channel" "ticket_channel" NOT NULL,
	"description" text NOT NULL,
	"redaction_findings" text[] DEFAULT '{}' NOT NULL,
	"reporter_ref" text,
	"affected_user_ref" text,
	"category" "ticket_category",
	"subtype" "ticket_subtype",
	"priority" "ticket_priority",
	"llm_priority" "ticket_priority",
	"confidence" real,
	"service" text,
	"rationale" text,
	"rules_subtype" "ticket_subtype",
	"routing_rule" text,
	"routing_to" "agent_name",
	"routing_queue" "escalation_queue",
	"routing_why" text,
	"sla_due_at" timestamp with time zone,
	"user_message" text,
	"escalation_queue" "escalation_queue",
	"escalation_reason" text,
	"resolution_summary" text,
	"resolution_evidence" text,
	"closure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_ref" text,
	"ticket_code" text NOT NULL,
	"action" "remediation_action" NOT NULL,
	"outcome" "remediation_outcome" NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_accounts" (
	"user_ref" text PRIMARY KEY NOT NULL,
	"status" "account_status" NOT NULL,
	"lock_reason" "lock_reason",
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"self_service_enrolled" boolean DEFAULT false NOT NULL,
	"last_reset_link_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_evidence" ADD CONSTRAINT "ticket_evidence_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_handoffs" ADD CONSTRAINT "ticket_handoffs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagnostic_runs_ticket_idx" ON "diagnostic_runs" USING btree ("ticket_code");--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_handoffs_ticket_idx" ON "ticket_handoffs" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_state_idx" ON "tickets" USING btree ("state");--> statement-breakpoint
CREATE INDEX "tickets_sla_idx" ON "tickets" USING btree ("sla_due_at");--> statement-breakpoint
CREATE INDEX "account_actions_ticket_idx" ON "account_actions" USING btree ("ticket_code");