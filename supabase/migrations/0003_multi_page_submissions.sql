-- Exam papers are often more than one page. Replace the single image_path
-- with an ordered array of storage paths so one submission can span multiple
-- photographed pages, graded together as one continuous paper.

alter table submissions add column if not exists image_paths text[] not null default '{}';

update submissions
set image_paths = array[image_path]
where image_path is not null and image_paths = '{}';

alter table submissions drop column if exists image_path;
