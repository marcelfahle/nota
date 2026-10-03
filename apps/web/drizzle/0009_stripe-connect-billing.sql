CREATE TABLE "invoice_sends" (
	"invoice_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"month" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_connect_states" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "stripe_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "stripe_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "stripe_subscription_status" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_sends" ADD CONSTRAINT "invoice_sends_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connect_states" ADD CONSTRAINT "stripe_connect_states_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connect_states" ADD CONSTRAINT "stripe_connect_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_stripe_account_id_unique" UNIQUE("stripe_account_id");--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");