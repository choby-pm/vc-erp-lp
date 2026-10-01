-- =============================================================================
-- 002_gp_connection_env.sql — GP 주소도 환경 변수 이름으로 (L21, R3-2)
-- =============================================================================
-- 로컬 개발(GP localhost:3000)과 배포(vc-erp-gp.vercel.app)가 같은 DB 행을 쓰게 된다
-- (L23: 배포 데모 DB는 로컬 개발 DB를 복사해 만든다). 그래서 주소를 DB에 직접 넣지 않고
-- API 키·서명 비밀 값처럼 "어느 환경 변수를 읽을지"만 저장한다. 각 환경이 자기 GP 주소를 변수에 둔다.
-- 연동 설정은 아직 한 건도 없어(R3-2에서 처음 넣는다) 컬럼을 바로 바꾼다.
-- =============================================================================

alter table gp_connections drop column base_url;
alter table gp_connections add column base_url_env text not null;   -- 예: GP_DEMO_BASE_URL (값 예: http://localhost:3000/api/lp/v1)
comment on column gp_connections.base_url_env is 'GP 연동 API 주소를 담은 환경 변수 이름 (L21)';
