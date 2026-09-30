CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`unlocked_group_ids` text DEFAULT '[]' NOT NULL,
	`user_agent` text,
	`ip` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`totp_secret` text,
	`role` text DEFAULT 'admin' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `words` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`czech` text NOT NULL,
	`russian` text NOT NULL,
	`english` text,
	`pos` text,
	`gender` text,
	`number_type` text,
	`aspect` text,
	`verb_pair` text,
	`conjugation_class` text,
	`declension_class` text,
	`notes` text,
	`lesson` integer,
	`source` text,
	`seznam_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
