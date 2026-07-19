CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" text NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
