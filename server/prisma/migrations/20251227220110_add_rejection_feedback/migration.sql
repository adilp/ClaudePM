-- CreateEnum
CREATE TYPE "TransitionTrigger" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "TransitionReason" AS ENUM ('session_started', 'completion_detected', 'user_approved', 'user_rejected');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "rejection_feedback" TEXT;

-- CreateTable
CREATE TABLE "ticket_state_history" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "from_state" "TicketState" NOT NULL,
    "to_state" "TicketState" NOT NULL,
    "trigger" "TransitionTrigger" NOT NULL,
    "reason" "TransitionReason" NOT NULL,
    "feedback" TEXT,
    "triggered_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_state_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_state_history_ticket_idx" ON "ticket_state_history"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_state_history_created_idx" ON "ticket_state_history"("created_at");

-- AddForeignKey
ALTER TABLE "ticket_state_history" ADD CONSTRAINT "ticket_state_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
