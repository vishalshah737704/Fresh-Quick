-- The audience filter in match_zippy_chunks is applied AFTER the approximate HNSW
-- scan, so a selective audience (vendor / admin) could get fewer than match_count
-- rows when the nearest neighbours mostly belong to other audiences. Iterative scan
-- keeps scanning the index until enough rows pass the filter.
--
-- The pgvector library is only loaded lazily, and until it is loaded the hnsw.*
-- setting is an unknown custom parameter that Postgres refuses to SET ("permission
-- denied to set parameter"). Casting a vector first loads the library in this session.
select '[1]'::extensions.vector;

alter function public.match_zippy_chunks(extensions.vector, text[], int)
  set hnsw.iterative_scan = strict_order;
