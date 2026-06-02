alter table adhd_tracker.profiles
add column if not exists rest_days int[] not null default '{6,0}';

comment on column adhd_tracker.profiles.rest_days is
'Weekday indices treated as rest days (0=Sun..6=Sat). Default: Sat+Sun.';
