-- Phase P1: 医院セルフサインアップの承認制ステータス
-- 冪等版（012/014と同スタイル）: 新規列は追加しない。既存 clinics.status（default 'active'）を
-- 拡張し、CHECK制約のみ新設する。
alter table clinics drop constraint if exists clinics_status_check;
alter table clinics
  add constraint clinics_status_check
  check (status in ('active', 'pending_approval', 'rejected'));
