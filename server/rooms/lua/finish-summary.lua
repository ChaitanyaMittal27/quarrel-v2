-- KEYS: room, public messages, deadlines. ARGV: work ID, claim token, text, source, test now, summary timeout, random ID.
local now = clock_now(ARGV[5])
if redis.call('EXISTS', KEYS[1]) == 0 or tonumber(redis.call('HGET', KEYS[1], 'expiresAt')) <= now then
  redis.call('ZREM', deadlines, string.sub(KEYS[1], 6))
  return cjson.encode({status='OK', changed=false})
end
if redis.call('HGET', KEYS[1], 'workId') ~= ARGV[1] or redis.call('HGET', KEYS[1], 'workClaimToken') ~= ARGV[2] then
  return cjson.encode({status='OK', changed=false})
end
local changed = clock_catchup(KEYS[1], KEYS[2], now)
if summary_finish(KEYS[1], KEYS[2], now, ARGV[1], ARGV[3], ARGV[4]) then changed = true end
return cjson.encode(clock_result(KEYS[1], now, changed))
