CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`name` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`path` text DEFAULT '/' NOT NULL,
	`pricing` text DEFAULT 'fixed' NOT NULL,
	`price_atomic` text,
	`quote_path` text,
	`max_price_atomic` text,
	`example_request` text,
	`example_response` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'live' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `services_listing_idx` ON `services` (`listing_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `payments` ADD `service_id` text REFERENCES services(id);--> statement-breakpoint
-- Data: every existing listing becomes a project with one fixed-price service that
-- matches all paths, so existing gateway URLs keep working unchanged.
INSERT INTO `services` (`id`, `listing_id`, `name`, `summary`, `method`, `path`, `pricing`, `price_atomic`, `example_request`, `example_response`, `sort_order`, `status`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), `id`, `name`, `summary`, `method`, '/', 'fixed', `price_atomic`, `example_request`, `example_response`, 0, 'live', `created_at`, unixepoch()
FROM `listings`;--> statement-breakpoint
UPDATE `payments` SET `service_id` = (SELECT s.`id` FROM `services` s WHERE s.`listing_id` = `payments`.`listing_id` LIMIT 1) WHERE `service_id` IS NULL;
