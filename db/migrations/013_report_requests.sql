create table report_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),fund_id uuid not null,
  gp_request_id uuid,
  as_of date not null,due_date date not null,reason text not null,requester text not null,
  requested_by uuid references users(id),
  delivery_status text not null default 'pending' check(delivery_status in ('pending','sent','rejected')),
  attempts integer not null default 0,
  next_retry_at timestamptz,last_attempt_at timestamptz,last_error text,
  snapshot jsonb,checked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(org_id,id),unique(org_id,gp_request_id),
  foreign key(org_id,fund_id) references funds(org_id,id),
  check(due_date>=as_of)
);
create table report_request_receipts (
  org_id uuid not null,request_id uuid not null,
  gp_reply_id uuid not null,version integer not null,
  report_id uuid not null,
  received_at timestamptz not null default clock_timestamp(),
  gp_ack_at timestamptz,
  primary key(org_id,gp_reply_id),unique(org_id,request_id,version),
  foreign key(org_id,request_id) references report_requests(org_id,id),
  foreign key(org_id,report_id) references reports(org_id,id)
);
