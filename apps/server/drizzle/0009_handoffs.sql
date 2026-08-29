CREATE TABLE `handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`chatbot_id` text NOT NULL,
	`reason` text NOT NULL,
	`intro` text,
	`fields_json` text NOT NULL,
	`answers_json` text,
	`created_at` integer NOT NULL,
	`submitted_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chatbot_id`) REFERENCES `chatbots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_handoffs_conversation` ON `handoffs` (`conversation_id`);
--> statement-breakpoint
CREATE INDEX `idx_handoffs_chatbot` ON `handoffs` (`chatbot_id`);
