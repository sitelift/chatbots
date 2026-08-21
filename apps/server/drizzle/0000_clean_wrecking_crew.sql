CREATE TABLE `chatbots` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website_url` text,
	`welcome_message` text DEFAULT 'Hi! How can I help?' NOT NULL,
	`brand_color` text DEFAULT '#4f46e5' NOT NULL,
	`avatar_url` text,
	`quick_replies` text DEFAULT '[]' NOT NULL,
	`powered_by` integer DEFAULT true NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`model` text DEFAULT 'gpt-4o-mini' NOT NULL,
	`base_url` text,
	`temperature` real DEFAULT 0.7 NOT NULL,
	`max_tokens` integer DEFAULT 512 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`allowed_domains` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`chatbot_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`visitor_name` text,
	`visitor_email` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chatbot_id`) REFERENCES `chatbots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_chatbot_visitor` ON `conversations` (`chatbot_id`,`visitor_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_created` ON `messages` (`conversation_id`,`created_at`);