-- CreateEnum
CREATE TYPE "TicketState" AS ENUM ('backlog', 'in_progress', 'review', 'done');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('ticket', 'adhoc');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('running', 'paused', 'completed', 'error');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('review_ready', 'context_low', 'handoff_complete', 'error', 'waiting_input');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "repo_path" VARCHAR(500) NOT NULL,
    "tickets_path" VARCHAR(500) NOT NULL DEFAULT 'docs/jira-tickets/',
    "handoff_path" VARCHAR(500) NOT NULL DEFAULT 'docs/ai-context/handoff.md',
    "tmux_session" VARCHAR(255) NOT NULL,
    "tmux_window" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "state" "TicketState" NOT NULL DEFAULT 'backlog',
    "file_path" VARCHAR(500) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "ticket_id" UUID,
    "parent_id" UUID,
    "type" "SessionType" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'running',
    "context_percent" INTEGER NOT NULL DEFAULT 0,
    "tmux_pane_id" VARCHAR(100) NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoff_events" (
    "id" UUID NOT NULL,
    "from_session_id" UUID NOT NULL,
    "to_session_id" UUID NOT NULL,
    "context_at_handoff" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handoff_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "session_id" UUID,
    "ticket_id" UUID,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_repo_path_key" ON "projects"("repo_path");

-- CreateIndex
CREATE INDEX "tickets_project_state_idx" ON "tickets"("project_id", "state");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "notifications_read_idx" ON "notifications"("read");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_events" ADD CONSTRAINT "handoff_events_from_session_id_fkey" FOREIGN KEY ("from_session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_events" ADD CONSTRAINT "handoff_events_to_session_id_fkey" FOREIGN KEY ("to_session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
