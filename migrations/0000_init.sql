CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`seller` text NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`upstream_url` text NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`price_atomic` text NOT NULL,
	`pay_to` text NOT NULL,
	`identity_name` text,
	`upstream_secret` text NOT NULL,
	`daily_cap_atomic` text,
	`example_request` text,
	`example_response` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`seller`) REFERENCES `sellers`(`address`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listings_slug_unique` ON `listings` (`slug`);--> statement-breakpoint
CREATE INDEX `listings_seller_idx` ON `listings` (`seller`);--> statement-breakpoint
CREATE INDEX `listings_status_idx` ON `listings` (`status`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`payer` text NOT NULL,
	`pay_to` text NOT NULL,
	`amount_atomic` text NOT NULL,
	`nonce` text NOT NULL,
	`status` text NOT NULL,
	`tx_hash` text,
	`error` text,
	`request_path` text NOT NULL,
	`upstream_status` integer,
	`latency_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_nonce_unique` ON `payments` (`nonce`);--> statement-breakpoint
CREATE INDEX `payments_listing_idx` ON `payments` (`listing_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_payto_idx` ON `payments` (`pay_to`,`created_at`);--> statement-breakpoint
CREATE TABLE `sellers` (
	`address` text PRIMARY KEY NOT NULL,
	`org_name` text,
	`contact_email` text,
	`created_at` integer NOT NULL
);
