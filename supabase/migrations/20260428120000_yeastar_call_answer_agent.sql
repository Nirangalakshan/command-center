-- Bridges Yeastar IncomingCall ANSWER (per-agent extension) to NewCdr when the CDR
-- callee field is a queue / DID rather than the answering extension.
CREATE TABLE IF NOT EXISTS public.yeastar_call_answer_agent (
  yeastar_call_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS yeastar_call_answer_agent_agent_id_idx
  ON public.yeastar_call_answer_agent (agent_id);

ALTER TABLE public.yeastar_call_answer_agent ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.yeastar_call_answer_agent IS
  'Temporary map Yeastar call_id → dashboard agent_id when IncomingCall reports ANSWER; consumed by NewCdr handler.';
