CREATE TABLE `facilitator_settles` (
	`pay_to` text NOT NULL,
	`day` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`pay_to`, `day`)
);
