-- Store why a generation attempt failed, for the async preview page's inline
-- error card. Null when the draft never failed or a retry succeeded.
ALTER TABLE "Draft" ADD COLUMN "failureReason" TEXT;
