-- KEYS: lock, leased counter, cache. ARGV: token, audio or '', cache TTL ms.
if redis.call('GET',KEYS[1]) == ARGV[1] then
  if ARGV[2] ~= '' then redis.call('SET',KEYS[3],ARGV[2],'PX',ARGV[3]) end
  redis.call('DEL',KEYS[1])
end
-- Each lease has its own token; an old finish never releases a newer owner's slot.
redis.call('ZREM',KEYS[2],ARGV[1])
return 1
