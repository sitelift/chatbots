PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chatbots` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website_url` text,
	`welcome_message` text DEFAULT 'Hi! How can I help?' NOT NULL,
	`brand_color` text DEFAULT '#18181b' NOT NULL,
	`avatar_url` text,
	`quick_replies` text DEFAULT '[]' NOT NULL,
	`show_logo` integer DEFAULT true NOT NULL,
	`show_name` integer DEFAULT true NOT NULL,
	`show_online` integer DEFAULT true NOT NULL,
	`powered_by` integer DEFAULT true NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`facts_json` text,
	`model` text,
	`base_url` text,
	`temperature` real DEFAULT 0.4 NOT NULL,
	`max_tokens` integer DEFAULT 512 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`allowed_domains` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_chatbots`("id", "name", "website_url", "welcome_message", "brand_color", "avatar_url", "quick_replies", "show_logo", "show_name", "show_online", "powered_by", "system_prompt", "facts_json", "model", "base_url", "temperature", "max_tokens", "status", "allowed_domains", "created_at", "updated_at") SELECT "id", "name", "website_url", "welcome_message", "brand_color", "avatar_url", "quick_replies", "show_logo", "show_name", "show_online", "powered_by", "system_prompt", "facts_json", "model", "base_url", "temperature", "max_tokens", "status", "allowed_domains", "created_at", "updated_at" FROM `chatbots`;--> statement-breakpoint
DROP TABLE `chatbots`;--> statement-breakpoint
ALTER TABLE `__new_chatbots` RENAME TO `chatbots`;--> statement-breakpoint
UPDATE `chatbots` SET `model` = NULL WHERE `model` = 'gpt-4o-mini';--> statement-breakpoint
PRAGMA foreign_keys=ON;