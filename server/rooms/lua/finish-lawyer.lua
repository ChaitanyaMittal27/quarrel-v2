-- KEYS: room, messages, deadlines. ARGV: work ID, text, source, test-only now.
local now = clock_now(ARGV[4])
if redis.call('EXISTS', KEYS[1]) == 0 or tonumber(redis.call('HGET', KEYS[1], 'expiresAt')) <= now then
  redis.call('ZREM', deadlines, string.sub(KEYS[1], 6))
  return cjson.encode({status='OK', changed=false})
end
if redis.call('HGET', KEYS[1], 'workId') ~= ARGV[1]
  or redis.call('HGET', KEYS[1], 'phase') ~= 'debate'
  or redis.call('HGET', KEYS[1], 'closed') == '1' then return cjson.encode({status='OK', changed=false}) end
-- The work deadline wins even if the late provider result arrives before the poller.
local changed = clock_catchup(KEYS[1], KEYS[2], now)
if clock_finish(KEYS[1], KEYS[2], now, ARGV[1], ARGV[2], ARGV[3]) then changed = true end
return cjson.encode(clock_result(KEYS[1], now, changed))
