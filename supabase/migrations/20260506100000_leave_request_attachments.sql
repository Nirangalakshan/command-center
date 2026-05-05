-- ═══════════════════════════════════════════════════════════════
-- Optional image attachment for leave requests (private storage)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.agent_leave_requests
  ADD COLUMN IF NOT EXISTS attachment_storage_path text;

COMMENT ON COLUMN public.agent_leave_requests.attachment_storage_path IS
  'Object path inside bucket leave-request-attachments: {user_id}/{leave_request_id}.{ext}';

DROP POLICY IF EXISTS "agent_leave_requests_insert_own" ON public.agent_leave_requests;

CREATE POLICY "agent_leave_requests_insert_own"
  ON public.agent_leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_role(auth.uid(), 'agent')
    AND status = 'pending'
    AND (
      attachment_storage_path IS NULL
      OR (
        split_part(attachment_storage_path, '/', 1) = auth.uid()::text
        AND split_part(attachment_storage_path, '/', 2) LIKE id::text || '.%'
        AND attachment_storage_path NOT LIKE '%//%'
        AND array_length(string_to_array(trim(both '/' FROM attachment_storage_path), '/'), 1) = 2
      )
    )
  );

-- Private bucket for agent-supplied photos (signed URLs in the app)
INSERT INTO storage.buckets (id, name, public)
VALUES ('leave-request-attachments', 'leave-request-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "leave_attach_select_own" ON storage.objects;
DROP POLICY IF EXISTS "leave_attach_select_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "leave_attach_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "leave_attach_delete_own" ON storage.objects;

CREATE POLICY "leave_attach_select_own"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'leave-request-attachments'
    AND public.has_role(auth.uid(), 'agent')
    AND (string_to_array(name, '/'))[1] = auth.uid()::text
  );

CREATE POLICY "leave_attach_select_super_admin"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'leave-request-attachments'
    AND public.has_role(auth.uid(), 'super-admin')
  );

CREATE POLICY "leave_attach_insert_own"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'leave-request-attachments'
    AND public.has_role(auth.uid(), 'agent')
    AND (string_to_array(name, '/'))[1] = auth.uid()::text
    AND array_length(string_to_array(trim(both '/' FROM name), '/'), 1) = 2
  );

CREATE POLICY "leave_attach_delete_own"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'leave-request-attachments'
    AND public.has_role(auth.uid(), 'agent')
    AND (string_to_array(name, '/'))[1] = auth.uid()::text
  );
