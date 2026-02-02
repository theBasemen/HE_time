-- Add freelance_documentation column to he_time_logs table
-- This field is required for freelancers to document what their time was used for
ALTER TABLE he_time_logs 
ADD COLUMN IF NOT EXISTS freelance_documentation TEXT;

-- Add comment to document the purpose of this column
COMMENT ON COLUMN he_time_logs.freelance_documentation IS 'Documentation field required for freelancers to describe what their time was used for';
