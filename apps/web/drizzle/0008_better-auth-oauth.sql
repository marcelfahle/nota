CREATE TABLE "accounts" (
	"access_token" text,
	"access_token_expires_at" timestamp,
	"account_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_token" text,
	"password" text,
	"provider_id" text NOT NULL,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"alg" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"crv" text,
	"expires_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"private_key" text NOT NULL,
	"public_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_access_tokens" (
	"authorization_code_id" text,
	"client_id" text NOT NULL,
	"confirmation" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" text,
	"refresh_id" uuid,
	"requested_user_info_claims" text[],
	"resources" text[],
	"revoked" timestamp,
	"scopes" text[] NOT NULL,
	"session_id" uuid,
	"token" text NOT NULL,
	"user_id" uuid,
	CONSTRAINT "oauth_access_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_assertions" (
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_resources" (
	"client_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metadata" jsonb,
	"resource_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"application_type" text,
	"backchannel_logout_session_required" boolean,
	"backchannel_logout_uri" text,
	"client_credentials_scopes" text[],
	"client_discovery_id" text,
	"client_id" text NOT NULL,
	"client_secret" text,
	"contacts" text[],
	"created_at" timestamp DEFAULT now(),
	"disabled" boolean DEFAULT false,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"enable_end_session" boolean,
	"grant_types" text[],
	"icon" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jwks" text,
	"jwks_uri" text,
	"metadata" jsonb,
	"name" text,
	"policy" text,
	"post_logout_redirect_uris" text[],
	"redirect_uris" text[] NOT NULL,
	"reference_id" text,
	"require_pkce" boolean,
	"response_types" text[],
	"scopes" text[],
	"skip_consent" boolean,
	"software_id" text,
	"software_statement" text,
	"software_version" text,
	"subject_type" text,
	"token_endpoint_auth_method" text,
	"tos" text,
	"updated_at" timestamp DEFAULT now(),
	"uri" text,
	"user_id" uuid,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_consents" (
	"client_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" text,
	"requested_user_info_claims" text[],
	"resources" text[],
	"scopes" text[] NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"auth_time" timestamp,
	"authorization_code_id" text,
	"client_id" text NOT NULL,
	"confirmation" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" text,
	"requested_user_info_claims" text[],
	"resources" text[],
	"revoked" timestamp,
	"rotated_at" timestamp,
	"rotation_replay_expires_at" timestamp,
	"rotation_replay_response" text,
	"scopes" text[] NOT NULL,
	"session_id" uuid,
	"token" text NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "oauth_refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_resources" (
	"access_token_ttl" integer,
	"allowed_scopes" text[],
	"created_at" timestamp DEFAULT now(),
	"custom_claims" jsonb,
	"disabled" boolean DEFAULT false,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"metadata" jsonb,
	"name" text NOT NULL,
	"policy_version" integer DEFAULT 1,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "oauth_resources_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text,
	"token" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_refresh_id_oauth_refresh_tokens_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_resource_id_oauth_resources_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."oauth_resources"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Move existing scrypt hashes to Better Auth credential accounts; same format, no resets needed.
INSERT INTO "accounts" ("account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT "users"."id"::text, 'credential', "users"."id", "users"."password_hash", now(), now()
FROM "users"
WHERE "users"."password_hash" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "accounts"
    WHERE "accounts"."user_id" = "users"."id" AND "accounts"."provider_id" = 'credential'
  );
