CREATE TABLE `review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`state` text NOT NULL,
	`message` text NOT NULL,
	`signature` text NOT NULL,
	`signer` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_events_service_idx` ON `review_events` (`service_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`service_id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`state` text NOT NULL,
	`repo_url` text,
	`commit` text,
	`contact` text NOT NULL,
	`note` text,
	`last_issued_at` integer,
	`reviewed_commit` text,
	`report_url` text,
	`reviewed_at` integer,
	`reviewed_target` text,
	`signer` text,
	`requested_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reviews_listing_idx` ON `reviews` (`listing_id`);--> statement-breakpoint
CREATE INDEX `reviews_state_idx` ON `reviews` (`state`);